import { z } from "zod";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { assertRequestCanBeSelected } from "@/modules/items/domain/item-rules";
import { initializeTransactionFromSelection } from "@/modules/transactions/application/transaction-service";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";
import { requireTransactionalEligibility } from "@/modules/pilot/application/pilot-policy-service";

export async function createItemRequest(actor: CurrentActor, itemId: string, rawMessage: string) {
  requirePermission(actor.roles, "item-request:create");
  const message = z
    .string()
    .trim()
    .min(1, "申込みメッセージを入力してください。")
    .max(500)
    .parse(rawMessage);
  return getPrisma().$transaction(async (transaction) => {
    await requireTransactionalEligibility(actor.id, transaction);
    const item = await transaction.item.findUnique({ where: { id: itemId } });
    if (!item || item.status !== "PUBLISHED") {
      throw new AppError("ITEM_UNAVAILABLE", "この物品には現在申込みできません。", 409);
    }
    if (item.ownerUserId === actor.id) {
      throw new AppError("SELF_REQUEST_FORBIDDEN", "自分の物品には申込みできません。", 409);
    }
    const request = await transaction.itemRequest.create({
      data: { itemId, requesterUserId: actor.id, message },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "item_request.created",
      targetType: "item_request",
      targetId: request.id,
      reason: "受取希望者による申込み",
      after: { itemId, status: request.status },
    });
    return request;
  });
}

export async function selectItemRequest(actor: CurrentActor, requestId: string) {
  requirePermission(actor.roles, "item-request:select-own");
  return getPrisma().$transaction(async (transaction) => {
    const request = await transaction.itemRequest.findUnique({
      where: { id: requestId },
      include: { item: true },
    });
    if (!request || request.item.ownerUserId !== actor.id) {
      throw new AppError("REQUEST_NOT_FOUND", "申込みが見つかりません。", 404);
    }
    await requireTransactionalEligibility(actor.id, transaction);
    await requireTransactionalEligibility(request.requesterUserId, transaction);
    assertRequestCanBeSelected(request.item.status, request.status);

    const claimed = await transaction.item.updateMany({
      where: { id: request.itemId, status: "PUBLISHED", version: request.item.version },
      data: { status: "RESERVED", version: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      throw new AppError(
        "CONCURRENT_UPDATE",
        "他の操作が先に完了しました。画面を更新してください。",
        409,
      );
    }
    await transaction.itemRequest.updateMany({
      where: { itemId: request.itemId, status: "REQUESTED", id: { not: request.id } },
      data: { status: "NOT_SELECTED" },
    });
    const selected = await transaction.itemRequest.update({
      where: { id: request.id },
      data: { status: "SELECTED", selectedAt: new Date(), selectedByUserId: actor.id },
    });
    await initializeTransactionFromSelection(transaction, request, actor);
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "item_request.selected",
      targetType: "item_request",
      targetId: request.id,
      reason: "提供者による受取人選択",
      before: { itemStatus: request.item.status, requestStatus: request.status },
      after: { itemStatus: "RESERVED", requestStatus: selected.status },
    });
    return selected;
  });
}
