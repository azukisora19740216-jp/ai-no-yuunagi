"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { recordCurrentPolicyConsents } from "@/modules/pilot/application/consent-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";

export async function reconsentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    await recordCurrentPolicyConsents(
      actor,
      formData.get("termsAgreed") === "on",
      formData.get("privacyAcknowledged") === "on",
    );
    revalidatePath("/dashboard");
    return { ok: true, message: "最新の文書版への確認を記録しました。" };
  } catch (error) {
    return actionError(error);
  }
}
