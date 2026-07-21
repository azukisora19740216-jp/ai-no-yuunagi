import type { TransactionStatus } from "@/generated/prisma/enums";
import { AppError } from "@/shared/errors/app-error";

export type TransactionCommand =
  | "ACCEPT_RECIPIENT_SELECTION"
  | "SCHEDULE_HANDOVER"
  | "REPORT_PROVIDER_COMPLETE"
  | "REPORT_RECIPIENT_COMPLETE"
  | "ADMIN_APPROVE"
  | "ADMIN_HOLD"
  | "ADMIN_CANCEL";

const transitions: Record<
  TransactionCommand,
  Partial<Record<TransactionStatus, TransactionStatus>>
> = {
  ACCEPT_RECIPIENT_SELECTION: { RECIPIENT_SELECTED: "ACCEPTED" },
  SCHEDULE_HANDOVER: { ACCEPTED: "HANDOVER_SCHEDULED" },
  REPORT_PROVIDER_COMPLETE: {
    HANDOVER_SCHEDULED: "PROVIDER_REPORTED_COMPLETE",
    RECIPIENT_REPORTED_COMPLETE: "UNDER_ADMIN_REVIEW",
  },
  REPORT_RECIPIENT_COMPLETE: {
    HANDOVER_SCHEDULED: "RECIPIENT_REPORTED_COMPLETE",
    PROVIDER_REPORTED_COMPLETE: "UNDER_ADMIN_REVIEW",
  },
  ADMIN_APPROVE: { UNDER_ADMIN_REVIEW: "COMPLETED", DISPUTED: "COMPLETED" },
  ADMIN_HOLD: { UNDER_ADMIN_REVIEW: "DISPUTED" },
  ADMIN_CANCEL: { UNDER_ADMIN_REVIEW: "CANCELLED", DISPUTED: "CANCELLED" },
};

export function nextTransactionStatus(
  current: TransactionStatus,
  command: TransactionCommand,
): TransactionStatus {
  const next = transitions[command][current];
  if (!next) {
    throw new AppError(
      "INVALID_TRANSACTION_TRANSITION",
      "現在の取引状態ではこの操作を実行できません。画面を更新してください。",
      409,
    );
  }
  return next;
}
