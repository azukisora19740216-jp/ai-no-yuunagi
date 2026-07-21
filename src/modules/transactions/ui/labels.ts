import type {
  PointLedgerEventType,
  PointLedgerStatus,
  ShippingWorkloadLevel,
  TransactionStatus,
} from "@/generated/prisma/enums";

export const transactionStatusLabel: Record<TransactionStatus, string> = {
  REQUESTED: "申込み済み",
  RECIPIENT_SELECTED: "受取人選択済み",
  ACCEPTED: "受取人承諾済み",
  HANDOVER_SCHEDULED: "受渡し準備済み",
  PROVIDER_REPORTED_COMPLETE: "提供者の完了報告済み",
  RECIPIENT_REPORTED_COMPLETE: "受取人の完了報告済み",
  UNDER_ADMIN_REVIEW: "運営確認待ち",
  COMPLETED: "運営確認済み",
  DISPUTED: "確認保留中",
  CANCELLED: "取消し",
  SUSPENDED: "停止中",
};

export const workloadLabel: Record<ShippingWorkloadLevel, string> = {
  NONE: "配送協力加算なし（0ポイント）",
  SIMPLE: "簡易梱包・発送（1ポイント）",
  STANDARD: "通常の宅配対応（2ポイント）",
  LARGE_SPECIAL: "大型品・特殊梱包（3ポイント）",
};

export const pointEventLabel: Record<PointLedgerEventType, string> = {
  BASE_AWARD: "運営確認後の基本付与",
  SHIPPING_BONUS: "配送協力加算",
  AWARD_HOLD: "付与保留",
  REVERSAL: "取消し（反対仕訳）",
  COMMON_POOL_TRANSFER_OUT: "共通おかげさまプールへ移行",
  HOLDING_CAP_OVERFLOW_OUT: "保有上限超過の共通プール移行",
  EXPIRY_OUT: "有効期限到来の共通プール移行",
};

export const pointStatusLabel: Record<PointLedgerStatus, string> = {
  POSTED: "確定記録",
  HELD: "保留（残高対象外）",
};
