import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { getActivePilotContext } from "@/modules/pilot/application/pilot-policy-service";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

export async function recordCurrentPolicyConsents(
  actor: CurrentActor,
  termsAgreed: boolean,
  privacyAcknowledged: boolean,
) {
  if (!termsAgreed || !privacyAcknowledged) {
    throw new AppError(
      "POLICY_CONSENT_REQUIRED",
      "利用規約への同意とプライバシーポリシーの確認が必要です。",
      400,
    );
  }
  return getPrisma().$transaction(async (transaction) => {
    const context = await getActivePilotContext(transaction);
    await transaction.consentRecord.createMany({
      data: [
        {
          userId: actor.id,
          policyVersionId: context.policyId,
          recordType: "TERMS",
          documentVersion: context.termsVersion,
          source: "member-reconsent",
        },
        {
          userId: actor.id,
          policyVersionId: context.policyId,
          recordType: "PRIVACY",
          documentVersion: context.privacyVersion,
          source: "member-reconsent",
        },
      ],
      skipDuplicates: true,
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "policy.reconsented",
      targetType: "service_policy_version",
      targetId: context.policyId,
      reason: "会員による最新版文書の確認",
      after: {
        policyVersion: context.policyVersion,
        termsVersion: context.termsVersion,
        privacyVersion: context.privacyVersion,
      },
    });
  });
}
