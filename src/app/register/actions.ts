"use server";

import { headers } from "next/headers";
import { auth } from "@/modules/identity/infrastructure/auth";
import { registerInvitedMember } from "@/modules/pilot/application/registration-service";
import { actionError, type ActionState } from "@/shared/ui/action-state";

function checked(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export async function registerPilotMemberAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const member = await registerInvitedMember({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      invitationCode: String(formData.get("invitationCode") ?? ""),
      areaKey: String(formData.get("areaKey") ?? ""),
      age18OrOver: checked(formData.get("age18OrOver")),
      termsAgreed: checked(formData.get("termsAgreed")),
      privacyAcknowledged: checked(formData.get("privacyAcknowledged")),
      oneAccountAttested: checked(formData.get("oneAccountAttested")),
    });
    await auth.api.sendVerificationEmail({
      body: { email: member.email, callbackURL: "/login?verified=1" },
      headers: await headers(),
    });
    return {
      ok: true,
      message: "招待登録を受け付けました。メール確認後にログインしてください。",
    };
  } catch (error) {
    return actionError(error);
  }
}
