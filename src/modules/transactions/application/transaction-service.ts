import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionStatus } from "@/generated/prisma/enums";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { calculatePointAward } from "@/modules/points/domain/point-rules";
import { postFormalTransactionAward } from "@/modules/points/application/formal-point-service";
import {
  nextTransactionStatus,
  type TransactionCommand,
} from "@/modules/transactions/domain/transaction-state-machine";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";
import { getServerEnv } from "@/shared/config/env";
import { requireTransactionalEligibility } from "@/modules/pilot/application/pilot-policy-service";

type TransactionClient = Prisma.TransactionClient;

const reviewInputSchema = z.object({
  decision: z.enum(["APPROVE", "HOLD", "CANCEL"]),
  shippingWorkloadLevel: z.enum(["NONE", "SIMPLE", "STANDARD", "LARGE_SPECIAL"]),
  reason: z.string().trim().min(1, "確認理由を入力してください。").max(500),
});

export type CompletionReviewInput = z.infer<typeof reviewInputSchema>;

type SelectedRequestForTransaction = {
  id: string;
  itemId: string;
  requesterUserId: string;
  item: { ownerUserId: string };
};

export async function initializeTransactionFromSelection(
  transaction: TransactionClient,
  request: SelectedRequestForTransaction,
  actor: CurrentActor,
) {
  const created = await transaction.transaction.create({
    data: {
      itemId: request.itemId,
      selectedRequestId: request.id,
      providerUserId: request.item.ownerUserId,
      recipientUserId: request.requesterUserId,
      status: "RECIPIENT_SELECTED",
    },
  });
  await transaction.transactionStatusEvent.create({
    data: {
      transactionId: created.id,
      fromStatus: "REQUESTED",
      toStatus: "RECIPIENT_SELECTED",
      eventType: "recipient_selected",
      actorUserId: actor.id,
      actorRole: actor.roles.join(","),
      reason: "提供者による受取人選択",
      idempotencyKey: `transaction:${created.id}:selected`,
    },
  });
  await appendAuditEvent(transaction, {
    actorId: actor.id,
    actorRole: actor.roles.join(","),
    action: "transaction.created",
    targetType: "transaction",
    targetId: created.id,
    reason: "提供者による受取人選択",
    after: {
      status: created.status,
      itemId: created.itemId,
      selectedRequestId: created.selectedRequestId,
    },
  });
  return created;
}

async function appendStatusEvent(
  transaction: TransactionClient,
  input: {
    transactionId: string;
    fromStatus: TransactionStatus;
    toStatus: TransactionStatus;
    eventType: string;
    actor: CurrentActor;
    reason: string;
    version: number;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await transaction.transactionStatusEvent.create({
    data: {
      transactionId: input.transactionId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      eventType: input.eventType,
      actorUserId: input.actor.id,
      actorRole: input.actor.roles.join(","),
      reason: input.reason,
      metadataSafeJson: input.metadata,
      idempotencyKey: `transaction:${input.transactionId}:${input.eventType}:v${input.version}`,
    },
  });
}

async function claimTransition(
  transaction: TransactionClient,
  current: { id: string; status: TransactionStatus; version: number },
  command: TransactionCommand,
  data: Prisma.TransactionUpdateManyMutationInput = {},
) {
  const nextStatus = nextTransactionStatus(current.status, command);
  const claimed = await transaction.transaction.updateMany({
    where: { id: current.id, status: current.status, version: current.version },
    data: { ...data, status: nextStatus, version: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new AppError(
      "CONCURRENT_TRANSACTION_UPDATE",
      "他の操作が先に完了しました。画面を更新してください。",
      409,
    );
  }
  return nextStatus;
}

async function transitionAsParticipant(
  actor: CurrentActor,
  transactionId: string,
  command: TransactionCommand,
  eventType: string,
  reason: string,
  authorize: (record: { providerUserId: string; recipientUserId: string }) => boolean,
  updateData:
    | Prisma.TransactionUpdateManyMutationInput
    | ((record: {
        providerReportedAt: Date | null;
        recipientReportedAt: Date | null;
        handoverOccurredAt: Date | null;
      }) => Prisma.TransactionUpdateManyMutationInput) = {},
  itemStatus?: "HANDOVER_IN_PROGRESS",
) {
  return getPrisma().$transaction(async (transaction) => {
    const current = await transaction.transaction.findUnique({ where: { id: transactionId } });
    if (!current) throw new AppError("TRANSACTION_NOT_FOUND", "取引が見つかりません。", 404);
    if (!authorize(current)) throw new AppError("FORBIDDEN", "この取引を操作できません。", 403);
    await requireTransactionalEligibility(actor.id, transaction);

    const resolvedUpdateData = typeof updateData === "function" ? updateData(current) : updateData;
    const nextStatus = await claimTransition(transaction, current, command, resolvedUpdateData);
    if (itemStatus) {
      await transaction.item.update({
        where: { id: current.itemId },
        data: { status: itemStatus },
      });
    }
    await appendStatusEvent(transaction, {
      transactionId,
      fromStatus: current.status,
      toStatus: nextStatus,
      eventType,
      actor,
      reason,
      version: current.version,
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: `transaction.${eventType}`,
      targetType: "transaction",
      targetId: transactionId,
      reason,
      before: { status: current.status },
      after: { status: nextStatus },
    });
    return { ...current, status: nextStatus, version: current.version + 1 };
  });
}

export function acceptRecipientSelection(actor: CurrentActor, transactionId: string) {
  requirePermission(actor.roles, "transaction:accept-own");
  return transitionAsParticipant(
    actor,
    transactionId,
    "ACCEPT_RECIPIENT_SELECTION",
    "recipient_accepted",
    "受取人本人による選択承諾",
    (record) => record.recipientUserId === actor.id,
  );
}

export function scheduleHandover(actor: CurrentActor, transactionId: string) {
  requirePermission(actor.roles, "transaction:schedule-own");
  return transitionAsParticipant(
    actor,
    transactionId,
    "SCHEDULE_HANDOVER",
    "handover_scheduled",
    "当事者による受渡し準備確認",
    (record) => record.providerUserId === actor.id || record.recipientUserId === actor.id,
    {},
    "HANDOVER_IN_PROGRESS",
  );
}

function normalizeHandoverOccurredAt(value?: Date) {
  const occurredAt = value ?? new Date();
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new AppError("HANDOVER_OCCURRED_AT_INVALID", "現実の引渡し日時を確認してください。", 400);
  }
  return occurredAt;
}

export function reportProviderComplete(
  actor: CurrentActor,
  transactionId: string,
  reportedHandoverOccurredAt?: Date,
) {
  requirePermission(actor.roles, "transaction:report-own");
  const occurredAt = normalizeHandoverOccurredAt(reportedHandoverOccurredAt);
  return transitionAsParticipant(
    actor,
    transactionId,
    "REPORT_PROVIDER_COMPLETE",
    "provider_reported_complete",
    "提供者による引渡し完了報告",
    (record) => record.providerUserId === actor.id,
    (record) => ({
      providerReportedAt: new Date(),
      handoverOccurredAt: record.handoverOccurredAt ?? occurredAt,
      bothReportedAt: record.recipientReportedAt ? new Date() : undefined,
    }),
  );
}

export function reportRecipientComplete(
  actor: CurrentActor,
  transactionId: string,
  reportedHandoverOccurredAt?: Date,
) {
  requirePermission(actor.roles, "transaction:report-own");
  const occurredAt = normalizeHandoverOccurredAt(reportedHandoverOccurredAt);
  return transitionAsParticipant(
    actor,
    transactionId,
    "REPORT_RECIPIENT_COMPLETE",
    "recipient_reported_complete",
    "受取人による受領完了報告",
    (record) => record.recipientUserId === actor.id,
    (record) => ({
      recipientReportedAt: new Date(),
      handoverOccurredAt: record.handoverOccurredAt ?? occurredAt,
      bothReportedAt: record.providerReportedAt ? new Date() : undefined,
    }),
  );
}

export async function reviewTransactionCompletion(
  actor: CurrentActor,
  transactionId: string,
  rawInput: CompletionReviewInput,
) {
  requirePermission(actor.roles, "transaction:review");
  const input = reviewInputSchema.parse(rawInput);

  return getPrisma().$transaction(async (transaction) => {
    const current = await transaction.transaction.findUnique({
      where: { id: transactionId },
      include: { item: true },
    });
    if (!current) throw new AppError("TRANSACTION_NOT_FOUND", "取引が見つかりません。", 404);
    if (!current.providerReportedAt || !current.recipientReportedAt) {
      throw new AppError("COMPLETION_REPORTS_MISSING", "双方の完了報告が揃っていません。", 409);
    }
    const award = calculatePointAward(current.item.deliveryMethod, input.shippingWorkloadLevel);

    const command: TransactionCommand =
      input.decision === "APPROVE"
        ? "ADMIN_APPROVE"
        : input.decision === "HOLD"
          ? "ADMIN_HOLD"
          : "ADMIN_CANCEL";
    const nextStatus = await claimTransition(transaction, current, command, {
      shippingWorkloadLevel: input.shippingWorkloadLevel,
      adminVerifiedAt: new Date(),
      adminVerifiedById: actor.id,
      completedAt: input.decision === "APPROVE" ? new Date() : null,
      adminFinalizedAt: input.decision === "APPROVE" ? new Date() : null,
      adminFinalizedById: input.decision === "APPROVE" ? actor.id : null,
      statusReason: input.reason,
    });

    const bonusPoints = award.shippingBonus;
    let overflowPoints = 0;
    if (input.decision === "APPROVE") {
      if (getServerEnv().FEATURE_FORMAL_POINTS) {
        const formal = await postFormalTransactionAward(transaction, {
          transactionId: current.id,
          userId: current.providerUserId,
          basePoints: award.basePoints,
          shippingBonus: bonusPoints,
          reason: input.reason,
          createdBy: actor.id,
        });
        overflowPoints = formal.overflowPoints;
      } else {
        await transaction.pointLedgerEntry.create({
          data: {
            transactionId: current.id,
            userId: current.providerUserId,
            eventType: "BASE_AWARD",
            points: 1,
            reason: input.reason,
            createdBy: actor.id,
            status: "POSTED",
            idempotencyKey: `transaction:${current.id}:base-award`,
            metadataSafeJson: { awardKind: "BASE", marketValueLinked: false },
          },
        });
        if (bonusPoints > 0) {
          await transaction.pointLedgerEntry.create({
            data: {
              transactionId: current.id,
              userId: current.providerUserId,
              eventType: "SHIPPING_BONUS",
              points: bonusPoints,
              reason: input.reason,
              createdBy: actor.id,
              status: "POSTED",
              idempotencyKey: `transaction:${current.id}:shipping-bonus`,
              metadataSafeJson: {
                awardKind: "SHIPPING_WORKLOAD",
                workloadLevel: input.shippingWorkloadLevel,
                shippingAmountLinked: false,
              },
            },
          });
        }
      }
      await transaction.item.update({
        where: { id: current.itemId },
        data: { status: "COMPLETED" },
      });
    } else if (input.decision === "HOLD") {
      await transaction.pointLedgerEntry.create({
        data: {
          transactionId: current.id,
          userId: current.providerUserId,
          eventType: "AWARD_HOLD",
          points: 1,
          reason: input.reason,
          createdBy: actor.id,
          status: "HELD",
          idempotencyKey: `transaction:${current.id}:base-hold`,
          metadataSafeJson: { awardKind: "BASE" },
        },
      });
      if (bonusPoints > 0) {
        await transaction.pointLedgerEntry.create({
          data: {
            transactionId: current.id,
            userId: current.providerUserId,
            eventType: "AWARD_HOLD",
            points: bonusPoints,
            reason: input.reason,
            createdBy: actor.id,
            status: "HELD",
            idempotencyKey: `transaction:${current.id}:shipping-hold`,
            metadataSafeJson: {
              awardKind: "SHIPPING_WORKLOAD",
              workloadLevel: input.shippingWorkloadLevel,
            },
          },
        });
      }
    } else {
      await transaction.item.update({
        where: { id: current.itemId },
        data: { status: "CANCELLED" },
      });
    }

    const eventType =
      input.decision === "APPROVE"
        ? "admin_finalized"
        : input.decision === "HOLD"
          ? "points_held"
          : "admin_cancelled";
    await appendStatusEvent(transaction, {
      transactionId: current.id,
      fromStatus: current.status,
      toStatus: nextStatus,
      eventType,
      actor,
      reason: input.reason,
      version: current.version,
      metadata: {
        shippingWorkloadLevel: input.shippingWorkloadLevel,
        awardedPoints: input.decision === "APPROVE" ? 1 + bonusPoints : 0,
        overflowPoints,
      },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: `transaction.${eventType}`,
      targetType: "transaction",
      targetId: current.id,
      reason: input.reason,
      before: { status: current.status },
      after: {
        status: nextStatus,
        shippingWorkloadLevel: input.shippingWorkloadLevel,
        postedPoints: input.decision === "APPROVE" ? 1 + bonusPoints : 0,
        overflowPoints,
      },
    });
    return {
      status: nextStatus,
      postedPoints: input.decision === "APPROVE" ? 1 + bonusPoints : 0,
      overflowPoints,
    };
  });
}
