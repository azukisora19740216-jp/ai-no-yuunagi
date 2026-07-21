import { z } from "zod";
import type { CommonPoolReason } from "@/generated/prisma/enums";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

const reasonSchema = z.string().trim().min(1, "理由を入力してください。").max(500);

export async function reversePointEntry(actor: CurrentActor, entryId: string, rawReason: string) {
  requirePermission(actor.roles, "points:reverse");
  const reason = reasonSchema.parse(rawReason);
  return getPrisma().$transaction(async (transaction) => {
    const original = await transaction.pointLedgerEntry.findUnique({
      where: { id: entryId },
      include: { reversal: true, sourceMovements: true },
    });
    if (
      !original ||
      original.status !== "POSTED" ||
      original.points <= 0 ||
      !["BASE_AWARD", "SHIPPING_BONUS"].includes(original.eventType)
    ) {
      throw new AppError("POINT_ENTRY_NOT_REVERSIBLE", "このポイント記録は取消しできません。", 409);
    }
    if (original.reversal) {
      throw new AppError(
        "POINT_ENTRY_ALREADY_REVERSED",
        "このポイント記録は既に取消し済みです。",
        409,
      );
    }
    if (original.policyVersionId && original.sourceMovements.length > 0) {
      throw new AppError(
        "FORMAL_POINT_REVERSAL_REQUIRES_POOL_REVIEW",
        "共通プール移行済みの正式ポイントは、影響確認前に取消しできません。",
        409,
      );
    }
    const reversal = await transaction.pointLedgerEntry.create({
      data: {
        transactionId: original.transactionId,
        userId: original.userId,
        eventType: "REVERSAL",
        points: -original.points,
        reason,
        createdBy: actor.id,
        reversalOfId: original.id,
        status: "POSTED",
        idempotencyKey: `point-reversal:${original.id}`,
        metadataSafeJson: { originalEventType: original.eventType },
        policyVersionId: original.policyVersionId,
      },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "points.reversed",
      targetType: "point_ledger_entry",
      targetId: reversal.id,
      reason,
      before: { originalEntryId: original.id, points: original.points },
      after: { reversalEntryId: reversal.id, points: reversal.points },
    });
    return reversal;
  });
}

export async function transferPointEntryToCommonPool(
  actor: CurrentActor,
  entryId: string,
  reasonCategory: CommonPoolReason,
  rawReason: string,
) {
  requirePermission(actor.roles, "points:common-pool");
  const category = z
    .enum(["UNSPECIFIED", "EXPIRED", "HOLDING_LIMIT_EXCEEDED", "CORRECTION"])
    .parse(reasonCategory);
  const reason = reasonSchema.parse(rawReason);

  return getPrisma().$transaction(async (transaction) => {
    const original = await transaction.pointLedgerEntry.findUnique({
      where: { id: entryId },
      include: { reversal: true },
    });
    if (
      !original ||
      original.status !== "POSTED" ||
      original.points <= 0 ||
      !["BASE_AWARD", "SHIPPING_BONUS"].includes(original.eventType)
    ) {
      throw new AppError(
        "POINT_ENTRY_NOT_TRANSFERABLE",
        "このポイント記録は共通プールへ移行できません。",
        409,
      );
    }
    if (original.policyVersionId) {
      throw new AppError(
        "FORMAL_POINT_REQUIRES_MOVEMENT",
        "正式ポイントの移行は部分movement処理を使用してください。",
        409,
      );
    }
    if (original.reversal) {
      throw new AppError(
        "POINT_ENTRY_ALREADY_CONSUMED",
        "このポイント記録は既に取消しまたは移行済みです。",
        409,
      );
    }
    const transferOut = await transaction.pointLedgerEntry.create({
      data: {
        transactionId: original.transactionId,
        userId: original.userId,
        eventType: "COMMON_POOL_TRANSFER_OUT",
        points: -original.points,
        reason,
        createdBy: actor.id,
        reversalOfId: original.id,
        status: "POSTED",
        idempotencyKey: `common-pool-transfer-out:${original.id}`,
        metadataSafeJson: { reasonCategory: category },
      },
    });
    const poolEntry = await transaction.commonPoolLedgerEntry.create({
      data: {
        sourcePointLedgerEntryId: transferOut.id,
        eventType: "TRANSFER_IN",
        reasonCategory: category,
        points: original.points,
        reason,
        createdBy: actor.id,
        idempotencyKey: `common-pool-transfer-in:${original.id}`,
      },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "points.transferred_to_common_pool",
      targetType: "common_pool_ledger_entry",
      targetId: poolEntry.id,
      reason,
      before: { sourceEntryId: original.id, userPoints: original.points },
      after: { poolEntryId: poolEntry.id, poolPoints: poolEntry.points, reasonCategory: category },
    });
    return { transferOut, poolEntry };
  });
}
