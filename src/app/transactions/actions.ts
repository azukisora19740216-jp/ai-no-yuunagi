"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import {
  acceptRecipientSelection,
  reportProviderComplete,
  reportRecipientComplete,
  reviewTransactionCompletion,
  scheduleHandover,
} from "@/modules/transactions/application/transaction-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";

export async function participantTransactionAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const transactionId = String(formData.get("transactionId") ?? "");
    const command = String(formData.get("command") ?? "");
    if (command === "accept") await acceptRecipientSelection(actor, transactionId);
    else if (command === "schedule") await scheduleHandover(actor, transactionId);
    else if (command === "report-provider")
      await reportProviderComplete(
        actor,
        transactionId,
        new Date(String(formData.get("handoverOccurredAt") ?? "")),
      );
    else if (command === "report-recipient")
      await reportRecipientComplete(
        actor,
        transactionId,
        new Date(String(formData.get("handoverOccurredAt") ?? "")),
      );
    else return { ok: false, message: "操作の種類が不正です。" };
    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath("/transactions");
    revalidatePath("/admin/transactions");
    return { ok: true, message: "取引状態を更新しました。" };
  } catch (error) {
    return actionError(error);
  }
}

export async function reviewTransactionAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const transactionId = String(formData.get("transactionId") ?? "");
    await reviewTransactionCompletion(actor, transactionId, {
      decision: String(formData.get("decision")) as "APPROVE" | "HOLD" | "CANCEL",
      shippingWorkloadLevel: String(formData.get("shippingWorkloadLevel")) as
        "NONE" | "SIMPLE" | "STANDARD" | "LARGE_SPECIAL",
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath("/admin/transactions");
    revalidatePath("/points");
    revalidatePath("/admin/points");
    return { ok: true, message: "管理確認結果を記録しました。" };
  } catch (error) {
    return actionError(error);
  }
}
