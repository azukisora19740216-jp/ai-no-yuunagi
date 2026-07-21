import type { ItemCondition, ItemStatus } from "@/generated/prisma/enums";

export const itemStatusLabel: Record<ItemStatus, string> = {
  DRAFT: "下書き",
  PENDING_REVIEW: "審査待ち",
  PUBLISHED: "公開中",
  RESERVED: "受取人選択済み",
  HANDOVER_IN_PROGRESS: "引渡し中",
  COMPLETED: "引渡し済み・運営確認済み",
  REJECTED: "差戻し",
  CANCELLED: "取消し",
  SUSPENDED: "停止中",
};
export const conditionLabel: Record<ItemCondition, string> = {
  UNUSED: "未使用",
  GOOD: "状態良好",
  USED: "使用感あり",
  NEEDS_REPAIR: "修理・手入れが必要",
};
