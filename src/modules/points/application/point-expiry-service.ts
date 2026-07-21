import { z } from "zod";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { appendPointMovement } from "@/modules/points/application/formal-point-service";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

export async function expirePointEntry(actor: CurrentActor, entryId: string, now = new Date()) {
  requirePermission(actor.roles, "points:expire");
  if (!getServerEnv().FEATURE_POINT_EXPIRY) {
    throw new AppError("POINT_EXPIRY_DISABLED", "ポイント失効処理は現在無効です。", 409);
  }
  return getPrisma().$transaction(async (transaction) => {
    const initial = await transaction.pointLedgerEntry.findUnique({
      where: { id: entryId },
      select: { userId: true },
    });
    if (!initial)
      throw new AppError("POINT_ENTRY_NOT_FOUND", "ポイント記録が見つかりません。", 404);
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`formal-points:${initial.userId}`}, 0))`;
    const source = await transaction.pointLedgerEntry.findUnique({
      where: { id: entryId },
      include: { sourceMovements: true, reversal: true, policyVersion: true },
    });
    if (
      !source ||
      source.status !== "POSTED" ||
      source.points <= 0 ||
      !["BASE_AWARD", "SHIPPING_BONUS"].includes(source.eventType) ||
      !source.policyVersionId ||
      source.policyVersion?.status !== "APPROVED" ||
      source.policyVersion.productionStartedAt === null ||
      source.policyVersion.productionStartedAt > now ||
      source.policyVersion.availableBalanceStatusMode !== "POSTED_ONLY" ||
      !source.expiresAt ||
      source.expiresAt > now
    ) {
      throw new AppError(
        "POINT_ENTRY_NOT_DUE_FOR_EXPIRY",
        "この正式ポイントは現在失効対象ではありません。",
        409,
      );
    }
    const alreadyMoved = source.sourceMovements.reduce((sum, movement) => sum + movement.points, 0);
    const remaining = source.reversal ? 0 : source.points - alreadyMoved;
    if (remaining <= 0) {
      throw new AppError(
        "POINT_ENTRY_ALREADY_EXPIRED_OR_MOVED",
        "このポイントは既に失効または共通プール移行済みです。",
        409,
      );
    }
    const result = await appendPointMovement(transaction, {
      movementType: "EXPIRY",
      sourceEntry: source,
      points: remaining,
      reason: "付与日の1年後が属する月の末日到来による失効",
      createdBy: actor.id,
      idempotencyKey: `point-expiry:${source.id}:${source.expiresAt.toISOString()}`,
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "points.expired_to_common_pool",
      targetType: "point_movement",
      targetId: result.movement.id,
      reason: "正式ポイント有効期限の到来",
      before: { sourceEntryId: source.id, remainingPoints: remaining },
      after: {
        movementType: "EXPIRY",
        points: remaining,
        sourceEntryUnchanged: true,
      },
    });
    return result;
  });
}

export async function runDuePointExpiry(actor: CurrentActor, rawLimit = 100) {
  requirePermission(actor.roles, "points:expire");
  const limit = z.number().int().min(1).max(500).parse(rawLimit);
  const now = new Date();
  const due = await getPrisma().pointLedgerEntry.findMany({
    where: {
      policyVersionId: { not: null },
      policyVersion: {
        status: "APPROVED",
        productionStartedAt: { not: null, lte: now },
        availableBalanceStatusMode: "POSTED_ONLY",
      },
      status: "POSTED",
      points: { gt: 0 },
      eventType: { in: ["BASE_AWARD", "SHIPPING_BONUS"] },
      expiresAt: { lte: now },
    },
    select: { id: true },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  const results = await Promise.allSettled(
    due.map((entry) => expirePointEntry(actor, entry.id, now)),
  );
  return {
    selected: due.length,
    expired: results.filter((result) => result.status === "fulfilled").length,
    skipped: results.filter((result) => result.status === "rejected").length,
  };
}
