"use client";

import { useActionState } from "react";
import { reconsentAction } from "@/app/dashboard/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function ReconsentForm({
  termsVersion,
  privacyVersion,
}: {
  termsVersion: string;
  privacyVersion: string;
}) {
  const [state, action, pending] = useActionState(reconsentAction, initialActionState);
  return (
    <form className="form-card" action={action}>
      <h2>文書版の確認</h2>
      <p>出品・申込み・取引参加には、現在有効な文書版への確認が必要です。</p>
      <label>
        <input type="checkbox" name="termsAgreed" required />
        利用規約（版: {termsVersion}）に同意します
      </label>
      <label>
        <input type="checkbox" name="privacyAcknowledged" required />
        プライバシーポリシー（版: {privacyVersion}）を確認しました
      </label>
      <button className="button" disabled={pending}>
        確認を追記する
      </button>
      {state.message ? <p className={state.ok ? "success" : "error"}>{state.message}</p> : null}
    </form>
  );
}
