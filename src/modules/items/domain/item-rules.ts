import type { ItemRequestStatus, ItemStatus } from "@/generated/prisma/enums";
import { AppError } from "@/shared/errors/app-error";

export function assertItemCanBeSubmitted(status: ItemStatus): void {
  if (status !== "DRAFT" && status !== "REJECTED") {
    throw new AppError(
      "INVALID_ITEM_STATE",
      "下書きまたは差戻し済みの物品だけ投稿申請できます。",
      409,
    );
  }
}

export function assertItemCanBeReviewed(status: ItemStatus): void {
  if (status !== "PENDING_REVIEW") {
    throw new AppError("INVALID_ITEM_STATE", "審査待ちの物品だけ承認または差戻しできます。", 409);
  }
}

export function assertRequestCanBeSelected(
  itemStatus: ItemStatus,
  requestStatus: ItemRequestStatus,
): void {
  if (itemStatus !== "PUBLISHED" || requestStatus !== "REQUESTED") {
    throw new AppError(
      "INVALID_REQUEST_STATE",
      "公開中の物品に対する未処理の申込みだけ選択できます。",
      409,
    );
  }
}
