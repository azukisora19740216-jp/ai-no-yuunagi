"use client";

import { useActionState } from "react";
import { requestItemAction } from "@/app/items/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function RequestForm({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState(requestItemAction, initialActionState);
  return (
    <form className="form-card" action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <label>
        受取申込みメッセージ
        <textarea name="message" required maxLength={500} rows={5} />
      </label>
      <p className="help">住所・電話番号・金銭交渉は記載しないでください。</p>
      <button className="button" disabled={pending}>
        受取りを申し込む
      </button>
      {state.message ? (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
