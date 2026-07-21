"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import {
  reviewItem,
  saveItemDraft,
  submitItemForReview,
} from "@/modules/items/application/item-service";
import {
  createItemRequest,
  selectItemRequest,
} from "@/modules/item-requests/application/item-request-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";

function bool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export async function saveItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let destination = "";
  try {
    const actor = await requireCurrentActor();
    const item = await saveItemDraft(
      actor,
      {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        categoryId: String(formData.get("categoryId") ?? ""),
        condition: String(formData.get("condition")) as "UNUSED" | "GOOD" | "USED" | "NEEDS_REPAIR",
        defectDescription: String(formData.get("defectDescription") ?? ""),
        deliveryMethod: String(formData.get("deliveryMethod")) as "HANDOVER" | "SHIPPING",
        handoverArea: String(formData.get("handoverArea") ?? ""),
        availableDates: String(formData.get("availableDates") ?? "")
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
        shippingSupported: bool(formData.get("shippingSupported")),
      },
      String(formData.get("itemId") ?? "") || undefined,
    );
    if (formData.get("intent") === "submit") await submitItemForReview(actor, item.id);
    revalidatePath("/dashboard");
    destination = "/dashboard?saved=1";
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function requestItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const itemId = String(formData.get("itemId") ?? "");
    await createItemRequest(actor, itemId, String(formData.get("message") ?? ""));
    revalidatePath(`/items/${itemId}`);
    return { ok: true, message: "受取申込みを受け付けました。" };
  } catch (error) {
    return actionError(error);
  }
}

export async function reviewItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    await reviewItem(
      actor,
      String(formData.get("itemId") ?? ""),
      String(formData.get("decision")) as "approve" | "reject",
      String(formData.get("reason") ?? ""),
    );
    revalidatePath("/admin/items");
    revalidatePath("/items");
    return { ok: true, message: "審査結果を記録しました。" };
  } catch (error) {
    return actionError(error);
  }
}

export async function selectRequestAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const itemId = String(formData.get("itemId") ?? "");
    await selectItemRequest(actor, String(formData.get("requestId") ?? ""));
    revalidatePath(`/items/${itemId}/requests`);
    revalidatePath("/dashboard");
    return { ok: true, message: "受取人を選択し、物品を予約状態にしました。" };
  } catch (error) {
    return actionError(error);
  }
}
