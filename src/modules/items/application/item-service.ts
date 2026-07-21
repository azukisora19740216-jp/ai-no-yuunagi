import { z } from "zod";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import {
  assertItemCanBeReviewed,
  assertItemCanBeSubmitted,
} from "@/modules/items/domain/item-rules";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";
import { requireTransactionalEligibility } from "@/modules/pilot/application/pilot-policy-service";

export const itemDraftInputSchema = z
  .object({
    title: z.string().trim().min(1, "タイトルを入力してください。").max(80),
    description: z.string().trim().min(1, "説明を入力してください。").max(2000),
    categoryId: z.uuid("カテゴリーを選択してください。"),
    condition: z.enum(["UNUSED", "GOOD", "USED", "NEEDS_REPAIR"]),
    defectDescription: z.string().trim().max(500).optional(),
    deliveryMethod: z.enum(["HANDOVER", "SHIPPING"]),
    handoverArea: z.string().trim().min(1, "受渡し地域を入力してください。").max(100),
    availableDates: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
    shippingSupported: z.boolean(),
  })
  .superRefine((input, context) => {
    if (input.deliveryMethod === "SHIPPING" && !input.shippingSupported) {
      context.addIssue({
        code: "custom",
        path: ["shippingSupported"],
        message: "配送を選ぶ場合は配送対応可を指定してください。",
      });
    }
  });

export type ItemDraftInput = z.infer<typeof itemDraftInputSchema>;

export async function saveItemDraft(
  actor: CurrentActor,
  rawInput: ItemDraftInput,
  itemId?: string,
) {
  requirePermission(actor.roles, "item:create");
  const input = itemDraftInputSchema.parse(rawInput);
  const prisma = getPrisma();
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, active: true },
  });
  if (!category)
    throw new AppError("CATEGORY_UNAVAILABLE", "選択したカテゴリーは利用できません。", 400);

  return prisma.$transaction(async (transaction) => {
    await requireTransactionalEligibility(actor.id, transaction);
    const existing = itemId ? await transaction.item.findUnique({ where: { id: itemId } }) : null;
    if (existing && existing.ownerUserId !== actor.id) {
      throw new AppError("FORBIDDEN", "この物品は編集できません。", 403);
    }
    if (existing && existing.status !== "DRAFT" && existing.status !== "REJECTED") {
      throw new AppError("INVALID_ITEM_STATE", "審査中または公開後の物品は編集できません。", 409);
    }

    const data = {
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      condition: input.condition,
      defectDescription: input.defectDescription || null,
      deliveryMethod: input.deliveryMethod,
      handoverArea: input.handoverArea,
      availableDates: input.availableDates,
      shippingSupported: input.shippingSupported,
      status: "DRAFT" as const,
      reviewReason: null,
    };
    const item = existing
      ? await transaction.item.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await transaction.item.create({ data: { ...data, ownerUserId: actor.id } });

    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: existing ? "item.draft_updated" : "item.draft_created",
      targetType: "item",
      targetId: item.id,
      reason: "提供者による下書き保存",
      after: {
        status: item.status,
        categoryId: item.categoryId,
        shippingSupported: item.shippingSupported,
      },
    });
    return item;
  });
}

export async function submitItemForReview(actor: CurrentActor, itemId: string) {
  requirePermission(actor.roles, "item:submit-own");
  return getPrisma().$transaction(async (transaction) => {
    await requireTransactionalEligibility(actor.id, transaction);
    const item = await transaction.item.findUnique({ where: { id: itemId } });
    if (!item || item.ownerUserId !== actor.id)
      throw new AppError("ITEM_NOT_FOUND", "物品が見つかりません。", 404);
    assertItemCanBeSubmitted(item.status);
    const updated = await transaction.item.update({
      where: { id: item.id },
      data: { status: "PENDING_REVIEW", reviewReason: null, version: { increment: 1 } },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "item.submitted",
      targetType: "item",
      targetId: item.id,
      reason: "提供者による投稿申請",
      before: { status: item.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function reviewItem(
  actor: CurrentActor,
  itemId: string,
  decision: "approve" | "reject",
  rawReason: string,
) {
  requirePermission(actor.roles, "item:review");
  const reason = z.string().trim().min(1, "審査理由を入力してください。").max(500).parse(rawReason);
  return getPrisma().$transaction(async (transaction) => {
    const item = await transaction.item.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("ITEM_NOT_FOUND", "物品が見つかりません。", 404);
    assertItemCanBeReviewed(item.status);
    const toStatus = decision === "approve" ? "PUBLISHED" : "REJECTED";
    const updated = await transaction.item.update({
      where: { id: item.id },
      data: {
        status: toStatus,
        reviewReason: reason,
        publishedAt: decision === "approve" ? new Date() : null,
        version: { increment: 1 },
      },
    });
    await transaction.itemReviewEvent.create({
      data: {
        itemId: item.id,
        reviewerUserId: actor.id,
        fromStatus: item.status,
        toStatus,
        reason,
      },
    });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: decision === "approve" ? "item.approved" : "item.rejected",
      targetType: "item",
      targetId: item.id,
      reason,
      before: { status: item.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
