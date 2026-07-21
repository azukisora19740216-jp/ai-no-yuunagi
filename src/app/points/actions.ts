"use server";

import { revalidatePath } from "next/cache";
import type { CommonPoolReason } from "@/generated/prisma/enums";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import {
  reversePointEntry,
  transferPointEntryToCommonPool,
} from "@/modules/points/application/point-ledger-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";
import { runDuePointExpiry } from "@/modules/points/application/point-expiry-service";

export async function managePointEntryAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const entryId = String(formData.get("entryId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const command = String(formData.get("command") ?? "");
    if (command === "reverse") {
      await reversePointEntry(actor, entryId, reason);
    } else if (command === "pool") {
      await transferPointEntryToCommonPool(
        actor,
        entryId,
        String(formData.get("reasonCategory")) as CommonPoolReason,
        reason,
      );
    } else {
      return { ok: false, message: "操作の種類が不正です。" };
    }
    revalidatePath("/points");
    revalidatePath("/admin/points");
    return { ok: true, message: "追記型台帳へ記録しました。既存記録は変更していません。" };
  } catch (error) {
    return actionError(error);
  }
}

export async function runPointExpiryAction(): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const result = await runDuePointExpiry(actor);
    revalidatePath("/points");
    revalidatePath("/admin/points");
    return {
      ok: true,
      message: `失効対象${result.selected}件を確認し、${result.expired}件を追記処理しました。`,
    };
  } catch (error) {
    return actionError(error);
  }
}
