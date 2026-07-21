import { createHmac } from "node:crypto";
import { z } from "zod";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { mockKycAdapter } from "@/modules/pilot/infrastructure/mock-kyc-adapter";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

const mockDecisionSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]),
  subjectReference: z.string().trim().min(8).max(200).optional(),
  validUntil: z.coerce.date().optional(),
  reasonCode: z.string().trim().max(100).optional(),
});

function hashSubjectReference(value: string): string {
  return createHmac("sha256", getServerEnv().AUTH_SECRET)
    .update(`kyc-subject:${value.trim()}`, "utf8")
    .digest("hex");
}

export async function recordMockKycDecision(
  actor: CurrentActor,
  rawInput: z.input<typeof mockDecisionSchema>,
) {
  requirePermission(actor.roles, "kyc:review");
  const input = mockDecisionSchema.parse(rawInput);
  if (input.status === "VERIFIED" && !input.subjectReference) {
    throw new AppError(
      "KYC_SUBJECT_REFERENCE_REQUIRED",
      "確認済み状態には開発用の一意な本人参照が必要です。",
      400,
    );
  }
  const decision = await mockKycAdapter.decide(input);
  const subjectReferenceHash = decision.subjectReference
    ? hashSubjectReference(decision.subjectReference)
    : null;
  const now = new Date();
  if (decision.validUntil && decision.validUntil <= now) {
    throw new AppError("KYC_VALIDITY_INVALID", "本人確認の有効期限を確認してください。", 400);
  }

  return getPrisma().$transaction(async (transaction) => {
    if (subjectReferenceHash) {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subjectReferenceHash}, 0))`;
    }
    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) throw new AppError("USER_NOT_FOUND", "会員が見つかりません。", 404);
    const existingClaim = subjectReferenceHash
      ? await transaction.kycSubjectClaim.findUnique({
          where: { subjectReferenceHash },
          select: { userId: true },
        })
      : null;
    if (existingClaim && existingClaim.userId !== input.userId) {
      throw new AppError(
        "KYC_SUBJECT_ALREADY_CLAIMED",
        "同一人物の可能性がある別アカウントが存在するため、管理確認が必要です。",
        409,
      );
    }
    const kycCase = await transaction.kycCase.create({
      data: {
        userId: input.userId,
        provider: decision.provider,
        status: decision.status,
        subjectReferenceHash,
        submittedAt: now,
        decidedAt: decision.status === "PENDING" ? null : now,
        validFrom: decision.status === "VERIFIED" ? now : null,
        validUntil: decision.status === "VERIFIED" ? (decision.validUntil ?? null) : null,
        reasonCode: decision.reasonCode || null,
        reviewedByUserId: actor.id,
      },
    });
    if (decision.status === "VERIFIED" && subjectReferenceHash && !existingClaim) {
      await transaction.kycSubjectClaim.create({
        data: {
          subjectReferenceHash,
          userId: input.userId,
          firstKycCaseId: kycCase.id,
        },
      });
    }
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "kyc.mock_decision_recorded",
      targetType: "kyc_case",
      targetId: kycCase.id,
      reason: decision.reasonCode || "開発環境のモック本人確認",
      after: {
        userId: input.userId,
        status: decision.status,
        provider: decision.provider,
        subjectReferenceStored: false,
        subjectUniquenessClaimed: decision.status === "VERIFIED",
      },
    });
    return kycCase;
  });
}

export function listKycCases() {
  return getPrisma().kycCase.findMany({
    include: { user: { select: { profile: { select: { displayName: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
}
