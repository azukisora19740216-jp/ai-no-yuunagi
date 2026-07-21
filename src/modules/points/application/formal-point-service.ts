import type { Prisma } from "@/generated/prisma/client";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import {
  calculateExpiryNoticeAt,
  calculatePointExpiryAt,
  splitAwardByAvailableCapacity,
} from "@/modules/points/domain/point-policy";
import { getServerEnv } from "@/shared/config/env";
import { AppError } from "@/shared/errors/app-error";

type TransactionClient = Prisma.TransactionClient;

export async function getActiveFormalPointPolicy(transaction: TransactionClient, now = new Date()) {
  const policy = await transaction.pointPolicyVersion.findFirst({
    where: {
      status: "APPROVED",
      effectiveFrom: { lte: now },
      productionStartedAt: { not: null, lte: now },
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (!policy || policy.productionStartedAt === null) {
    throw new AppError(
      "FORMAL_POINT_POLICY_NOT_READY",
      "本番開始日時と正式ポイントポリシーが未確定のため、ポイントを確定できません。",
      503,
    );
  }
  if (
    policy.baseAwardPoints !== 1 ||
    policy.shippingBonusMax !== 3 ||
    policy.transactionTotalMax !== 4 ||
    policy.availableBalanceCap !== 30 ||
    policy.availableBalanceStatusMode !== "POSTED_ONLY" ||
    policy.expiryMonths !== 12 ||
    policy.timezone !== "Asia/Tokyo"
  ) {
    throw new AppError("FORMAL_POINT_POLICY_INVALID", "正式ポイント設定が不正です。", 500);
  }
  return policy;
}

async function scheduleExpiryNotifications(
  transaction: TransactionClient,
  input: { entryId: string; userId: string; expiresAt: Date },
) {
  if (!getServerEnv().FEATURE_POINT_EXPIRY_NOTIFICATIONS) return;
  for (const noticeDays of [60, 30, 7] as const) {
    const scheduledFor = calculateExpiryNoticeAt(input.expiresAt, noticeDays);
    const outbox = await transaction.outboxEvent.create({
      data: {
        topic: "points.expiry_notice_due",
        aggregateType: "point_ledger_entry",
        aggregateId: input.entryId,
        payloadSafeJson: { pointEntryId: input.entryId, noticeDays },
        availableAt: scheduledFor,
        idempotencyKey: `point-expiry-notice:${input.entryId}:${noticeDays}`,
      },
    });
    await transaction.pointExpiryNotification.create({
      data: {
        userId: input.userId,
        pointEntryId: input.entryId,
        noticeDays,
        scheduledFor,
        outboxEventId: outbox.id,
        idempotencyKey: `point-expiry-notification:${input.entryId}:${noticeDays}`,
      },
    });
  }
}

export async function appendPointMovement(
  transaction: TransactionClient,
  input: {
    movementType: "HOLDING_CAP_OVERFLOW" | "EXPIRY";
    sourceEntry: {
      id: string;
      transactionId: string | null;
      userId: string;
      policyVersionId: string | null;
      awardedAt: Date | null;
      expiresAt: Date | null;
      awardGroupId: string | null;
    };
    points: number;
    reason: string;
    createdBy: string;
    idempotencyKey: string;
  },
) {
  if (
    input.points <= 0 ||
    !input.sourceEntry.policyVersionId ||
    !input.sourceEntry.awardedAt ||
    !input.sourceEntry.expiresAt ||
    !input.sourceEntry.awardGroupId
  ) {
    throw new AppError("POINT_MOVEMENT_INVALID", "ポイント移行条件が不正です。", 409);
  }
  const eventType =
    input.movementType === "HOLDING_CAP_OVERFLOW" ? "HOLDING_CAP_OVERFLOW_OUT" : "EXPIRY_OUT";
  const reasonCategory =
    input.movementType === "HOLDING_CAP_OVERFLOW" ? "HOLDING_LIMIT_EXCEEDED" : "EXPIRED";
  const userOut = await transaction.pointLedgerEntry.create({
    data: {
      transactionId: input.sourceEntry.transactionId,
      userId: input.sourceEntry.userId,
      eventType,
      points: -input.points,
      reason: input.reason,
      createdBy: input.createdBy,
      status: "POSTED",
      idempotencyKey: `${input.idempotencyKey}:user-out`,
      policyVersionId: input.sourceEntry.policyVersionId,
      awardedAt: input.sourceEntry.awardedAt,
      expiresAt: input.sourceEntry.expiresAt,
      awardGroupId: input.sourceEntry.awardGroupId,
      metadataSafeJson: {
        sourcePointEntryId: input.sourceEntry.id,
        movementType: input.movementType,
      },
    },
  });
  const poolIn = await transaction.commonPoolLedgerEntry.create({
    data: {
      sourcePointLedgerEntryId: userOut.id,
      eventType: "TRANSFER_IN",
      reasonCategory,
      points: input.points,
      reason: input.reason,
      createdBy: input.createdBy,
      idempotencyKey: `${input.idempotencyKey}:pool-in`,
    },
  });
  const movement = await transaction.pointMovement.create({
    data: {
      movementType: input.movementType,
      sourcePointEntryId: input.sourceEntry.id,
      userOutEntryId: userOut.id,
      poolInEntryId: poolIn.id,
      policyVersionId: input.sourceEntry.policyVersionId,
      points: input.points,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.createdBy,
    },
  });
  return { userOut, poolIn, movement };
}

export async function postFormalTransactionAward(
  transaction: TransactionClient,
  input: {
    transactionId: string;
    userId: string;
    basePoints: number;
    shippingBonus: number;
    reason: string;
    createdBy: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`formal-points:${input.userId}`}, 0))`;
  const policy = await getActiveFormalPointPolicy(transaction, now);
  if (
    input.basePoints !== policy.baseAwardPoints ||
    input.shippingBonus < 0 ||
    input.shippingBonus > policy.shippingBonusMax ||
    input.basePoints + input.shippingBonus > policy.transactionTotalMax
  ) {
    throw new AppError("POINT_AWARD_OUT_OF_POLICY", "ポイント付与数が正式設定の範囲外です。", 409);
  }
  const balance =
    (
      await transaction.pointLedgerEntry.aggregate({
        where: {
          userId: input.userId,
          status: "POSTED",
          policyVersion: {
            status: "APPROVED",
            productionStartedAt: { not: null, lte: now },
            availableBalanceStatusMode: "POSTED_ONLY",
          },
        },
        _sum: { points: true },
      })
    )._sum.points ?? 0;
  const awardGroupId = crypto.randomUUID();
  const expiresAt = calculatePointExpiryAt(now, policy.expiryMonths);
  const base = await transaction.pointLedgerEntry.create({
    data: {
      transactionId: input.transactionId,
      userId: input.userId,
      eventType: "BASE_AWARD",
      points: input.basePoints,
      reason: input.reason,
      createdBy: input.createdBy,
      status: "POSTED",
      idempotencyKey: `transaction:${input.transactionId}:base-award`,
      policyVersionId: policy.id,
      awardedAt: now,
      expiresAt,
      awardGroupId,
      metadataSafeJson: { awardKind: "BASE", marketValueLinked: false },
    },
  });
  const awards = [base];
  if (input.shippingBonus > 0) {
    awards.push(
      await transaction.pointLedgerEntry.create({
        data: {
          transactionId: input.transactionId,
          userId: input.userId,
          eventType: "SHIPPING_BONUS",
          points: input.shippingBonus,
          reason: input.reason,
          createdBy: input.createdBy,
          status: "POSTED",
          idempotencyKey: `transaction:${input.transactionId}:shipping-bonus`,
          policyVersionId: policy.id,
          awardedAt: now,
          expiresAt,
          awardGroupId,
          metadataSafeJson: { awardKind: "SHIPPING_WORKLOAD", shippingAmountLinked: false },
        },
      }),
    );
  }
  for (const award of awards) {
    await scheduleExpiryNotifications(transaction, {
      entryId: award.id,
      userId: award.userId,
      expiresAt,
    });
  }
  const splits = splitAwardByAvailableCapacity(balance, policy.availableBalanceCap, awards);
  let overflowPoints = 0;
  for (const split of splits) {
    if (split.overflow === 0) continue;
    overflowPoints += split.overflow;
    await appendPointMovement(transaction, {
      movementType: "HOLDING_CAP_OVERFLOW",
      sourceEntry: split,
      points: split.overflow,
      reason: "利用可能残高上限30ポイントの超過分",
      createdBy: input.createdBy,
      idempotencyKey: `point-overflow:${split.id}`,
    });
  }
  await appendAuditEvent(transaction, {
    actorId: input.createdBy,
    action: "points.formal_award_posted",
    targetType: "transaction",
    targetId: input.transactionId,
    reason: input.reason,
    after: {
      policyVersion: policy.version,
      awardedPoints: input.basePoints + input.shippingBonus,
      overflowPoints,
      availableBalanceCap: policy.availableBalanceCap,
      expiresAt: expiresAt.toISOString(),
    },
  });
  return { awards, overflowPoints, policy, expiresAt };
}
