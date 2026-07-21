import { z } from "zod";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { generateInvitationCode, hashInvitationCode } from "@/modules/pilot/domain/invitation-code";
import { getActivePilotContext } from "@/modules/pilot/application/pilot-policy-service";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

const issueSchema = z.object({
  source: z.string().trim().min(1, "招待元を入力してください。").max(100),
  expiresAt: z.coerce.date(),
  countsTowardLimit: z.boolean(),
});

export async function issueInvitation(actor: CurrentActor, rawInput: z.input<typeof issueSchema>) {
  requirePermission(actor.roles, "pilot:manage");
  if (!getServerEnv().FEATURE_PILOT_ENROLLMENT) {
    throw new AppError("PILOT_FEATURE_DISABLED", "招待制登録は現在無効です。", 409);
  }
  const input = issueSchema.parse(rawInput);
  const now = new Date();
  if (input.expiresAt <= now) {
    throw new AppError("INVITATION_EXPIRY_INVALID", "失効日時は現在より後にしてください。", 400);
  }
  const code = generateInvitationCode();
  const codeHash = hashInvitationCode(code);
  const invitation = await getPrisma().$transaction(async (transaction) => {
    await getActivePilotContext(transaction, now);
    const created = await transaction.invitation.create({
      data: {
        codeHash,
        source: input.source,
        issuedByUserId: actor.id,
        expiresAt: input.expiresAt,
        countsTowardLimit: input.countsTowardLimit,
      },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "pilot.invitation_issued",
      targetType: "invitation",
      targetId: created.id,
      reason: "運営者による単回招待コード発行",
      after: {
        source: created.source,
        expiresAt: created.expiresAt.toISOString(),
        countsTowardLimit: created.countsTowardLimit,
      },
    });
    return created;
  });
  return { invitation, code };
}

export async function revokeInvitation(
  actor: CurrentActor,
  invitationId: string,
  rawReason: string,
) {
  requirePermission(actor.roles, "pilot:manage");
  const reason = z
    .string()
    .trim()
    .min(1, "取消し理由を入力してください。")
    .max(500)
    .parse(rawReason);
  return getPrisma().$transaction(async (transaction) => {
    const now = new Date();
    const updated = await transaction.invitation.updateMany({
      where: { id: invitationId, status: "ISSUED", usedAt: null, revokedAt: null },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedByUserId: actor.id,
        revokeReason: reason,
      },
    });
    if (updated.count !== 1) {
      throw new AppError("INVITATION_NOT_REVOCABLE", "この招待コードは取消しできません。", 409);
    }
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "pilot.invitation_revoked",
      targetType: "invitation",
      targetId: invitationId,
      reason,
      after: { status: "REVOKED", revokedAt: now.toISOString() },
    });
  });
}

export function listInvitations() {
  return getPrisma().invitation.findMany({
    select: {
      id: true,
      source: true,
      status: true,
      countsTowardLimit: true,
      issuedAt: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      issuedBy: { select: { profile: { select: { displayName: true } } } },
      usedBy: { select: { profile: { select: { displayName: true } } } },
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });
}

export async function getPilotAdminOverview() {
  const prisma = getPrisma();
  const [context, invitations, kycCases, users, countedMembers] = await Promise.all([
    getActivePilotContext(),
    listInvitations(),
    prisma.kycCase.findMany({
      include: { user: { select: { profile: { select: { displayName: true } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    prisma.user.findMany({
      select: { id: true, profile: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.pilotMembership.count({
      where: { countsTowardLimit: true, status: { in: ["PROVISIONAL", "ACTIVE", "SUSPENDED"] } },
    }),
  ]);
  return { context, invitations, kycCases, users, countedMembers };
}
