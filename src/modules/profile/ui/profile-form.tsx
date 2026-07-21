"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/profile/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function ProfileForm({
  profile,
}: {
  profile: { displayName: string; bio: string | null; handoverArea: string | null } | null;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, initialActionState);
  return (
    <form className="form-card" action={action}>
      <label>
        表示名
        <input
          name="displayName"
          required
          maxLength={50}
          defaultValue={profile?.displayName ?? ""}
        />
      </label>
      <label>
        自己紹介
        <textarea name="bio" maxLength={500} rows={5} defaultValue={profile?.bio ?? ""} />
      </label>
      <label>
        受渡し地域
        <input name="handoverArea" maxLength={100} defaultValue={profile?.handoverArea ?? ""} />
      </label>
      <p className="help">詳細な住所や電話番号は入力しないでください。</p>
      <button className="button" disabled={pending}>
        {pending ? "更新中…" : "更新する"}
      </button>
      {state.message ? (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
