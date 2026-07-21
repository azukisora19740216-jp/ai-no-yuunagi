"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { issueInvitation, revokeInvitation } from "@/modules/pilot/application/invitation-service";
import { recordMockKycDecision } from "@/modules/pilot/application/kyc-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";

export async function issueInvitationAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    const result = await issueInvitation(actor, {
      source: String(formData.get("source") ?? ""),
      expiresAt: String(formData.get("expiresAt") ?? ""),
      countsTowardLimit: formData.get("countsTowardLimit") !== "false",
    });
    revalidatePath("/admin/pilot");
    return {
      ok: true,
      message: `招待コード（この画面で一度だけ表示）: ${result.code}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeInvitationAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    await revokeInvitation(
      actor,
      String(formData.get("invitationId") ?? ""),
      String(formData.get("reason") ?? ""),
    );
    revalidatePath("/admin/pilot");
    return { ok: true, message: "招待を失効しました。" };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordMockKycAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCurrentActor();
    await recordMockKycDecision(actor, {
      userId: String(formData.get("userId") ?? ""),
      status: String(formData.get("status") ?? "") as
        "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED",
      subjectReference: String(formData.get("subjectReference") ?? "") || undefined,
      validUntil: String(formData.get("validUntil") ?? "") || undefined,
      reasonCode: String(formData.get("reasonCode") ?? "") || undefined,
    });
    revalidatePath("/admin/pilot");
    return { ok: true, message: "モック本人確認の判定履歴を追記しました。" };
  } catch (error) {
    return actionError(error);
  }
}
