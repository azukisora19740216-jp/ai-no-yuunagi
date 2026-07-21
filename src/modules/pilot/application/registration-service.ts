import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { getActivePilotContext } from "@/modules/pilot/application/pilot-policy-service";
import { hashInvitationCode } from "@/modules/pilot/domain/invitation-code";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

export const pilotRegistrationSchema = z.object({
  name: z.string().trim().min(1, "表示名を入力してください。").max(50),
  email: z.email("メールアドレスを確認してください。").transform((value) => value.toLowerCase()),
  password: z.string().min(12, "パスワードは12文字以上です。").max(128),
  invitationCode: z.string().trim().min(1, "招待コードを入力してください。").max(200),
  areaKey: z.string().trim().min(1, "対象地域を選択してください。").max(100),
  age18OrOver: z.literal(true, "18歳以上であることの確認が必要です。"),
  termsAgreed: z.literal(true, "利用規約への同意が必要です。"),
  privacyAcknowledged: z.literal(true, "プライバシーポリシーの確認が必要です。"),
  oneAccountAttested: z.literal(true, "1人1アカウントの確認が必要です。"),
});

export type PilotRegistrationInput = {
  name: string;
  email: string;
  password: string;
  invitationCode: string;
  areaKey: string;
  age18OrOver: boolean;
  termsAgreed: boolean;
  privacyAcknowledged: boolean;
  oneAccountAttested: boolean;
};

export async function registerInvitedMember(rawInput: PilotRegistrationInput) {
  if (!getServerEnv().FEATURE_PILOT_ENROLLMENT) {
    throw new AppError("PILOT_FEATURE_DISABLED", "招待制登録は現在無効です。", 409);
  }
  const input = pilotRegistrationSchema.parse(rawInput);
  const password = await hashPassword(input.password);
  const codeHash = hashInvitationCode(input.invitationCode);
  const now = new Date();
  const userId = randomUUID();

  try {
    return await getPrisma().$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('pilot-registration-limit', 0))`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${codeHash}, 0))`;
      const context = await getActivePilotContext(transaction, now);
      if (!context.allowedAreaKeys.includes(input.areaKey)) {
        throw new AppError("PILOT_AREA_OUTSIDE", "対象地域外のため登録できません。", 403);
      }
      const invitation = await transaction.invitation.findUnique({ where: { codeHash } });
      if (
        !invitation ||
        invitation.status !== "ISSUED" ||
        invitation.usedAt !== null ||
        invitation.revokedAt !== null ||
        invitation.expiresAt <= now
      ) {
        throw new AppError(
          "INVITATION_UNAVAILABLE",
          "招待コードが無効、使用済み、または期限切れです。",
          409,
        );
      }
      if (invitation.countsTowardLimit) {
        const currentCount = await transaction.pilotMembership.count({
          where: {
            countsTowardLimit: true,
            status: { in: ["PROVISIONAL", "ACTIVE", "SUSPENDED"] },
          },
        });
        if (currentCount >= context.registrationLimit) {
          throw new AppError(
            "PILOT_REGISTRATION_LIMIT_REACHED",
            "実証運用の登録上限に達しているため、現在登録できません。",
            409,
          );
        }
      }

      const user = await transaction.user.create({
        data: { id: userId, name: input.name, email: input.email, emailVerified: false },
      });
      await transaction.account.create({
        data: {
          userId,
          providerId: "credential",
          accountId: userId,
          password,
        },
      });
      await transaction.userRole.create({
        data: { userId, role: "USER", reason: "招待制会員登録時の基本ロール" },
      });
      await transaction.profile.create({
        data: { userId, displayName: input.name, handoverArea: context.regionLabel },
      });
      const consumed = await transaction.invitation.updateMany({
        where: {
          id: invitation.id,
          status: "ISSUED",
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: "USED", usedAt: now, usedByUserId: userId },
      });
      if (consumed.count !== 1) {
        throw new AppError("INVITATION_ALREADY_USED", "招待コードは既に使用されています。", 409);
      }
      await transaction.pilotMembership.create({
        data: {
          userId,
          invitationId: invitation.id,
          areaKey: input.areaKey,
          status: "ACTIVE",
          countsTowardLimit: invitation.countsTowardLimit,
          oneAccountAttestedAt: now,
        },
      });
      await transaction.consentRecord.createMany({
        data: [
          {
            userId,
            policyVersionId: context.policyId,
            recordType: "TERMS",
            documentVersion: context.termsVersion,
            source: "pilot-registration",
          },
          {
            userId,
            policyVersionId: context.policyId,
            recordType: "PRIVACY",
            documentVersion: context.privacyVersion,
            source: "pilot-registration",
          },
          {
            userId,
            policyVersionId: context.policyId,
            recordType: "AGE_18_PLUS",
            documentVersion: "age-18-plus-v1",
            source: "pilot-registration",
          },
          {
            userId,
            policyVersionId: context.policyId,
            recordType: "ONE_ACCOUNT",
            documentVersion: "one-account-v1",
            source: "pilot-registration",
          },
        ],
      });
      await appendAuditEvent(transaction, {
        actorId: userId,
        actorRole: "USER",
        action: "pilot.invitation_used",
        targetType: "invitation",
        targetId: invitation.id,
        reason: "招待制会員登録",
        after: { usedAt: now.toISOString(), source: invitation.source },
      });
      await appendAuditEvent(transaction, {
        actorId: userId,
        actorRole: "USER",
        action: "member.registered",
        targetType: "user",
        targetId: userId,
        reason: "招待制会員登録と必須確認の完了",
        after: {
          status: "ACTIVE",
          emailVerified: false,
          accountType: "INDIVIDUAL",
          policyVersion: context.policyVersion,
          areaKey: input.areaKey,
          age18OrOverConfirmed: true,
          oneAccountAttested: true,
        },
      });
      return { id: user.id, email: user.email };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AppError(
        "REGISTRATION_CONFLICT",
        "登録できませんでした。入力内容または登録状況をご確認ください。",
        409,
      );
    }
    throw error;
  }
}
