"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { updateOwnProfile } from "@/modules/profile/application/profile-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";

export async function updateProfileAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    await updateOwnProfile(actor, {
      displayName: String(formData.get("displayName") ?? ""),
      bio: String(formData.get("bio") ?? ""),
      handoverArea: String(formData.get("handoverArea") ?? ""),
    });
    revalidatePath("/profile");
    return { ok: true, message: "プロフィールを更新しました。" };
  } catch (error) {
    return actionError(error);
  }
}
