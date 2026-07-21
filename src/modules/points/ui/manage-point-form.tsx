"use client";

import { useActionState } from "react";
import { managePointEntryAction } from "@/app/points/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function ManagePointForm({ entryId, formal }: { entryId: string; formal: boolean }) {
  const [state, action, pending] = useActionState(managePointEntryAction, initialActionState);
  return (
    <form className="review-form" action={action}>
      <input type="hidden" name="entryId" value={entryId} />
      <label>
        理由
        <input name="reason" required maxLength={500} />
      </label>
      <label>
        共通プール移行理由
        <select name="reasonCategory" defaultValue="CORRECTION">
          <option value="UNSPECIFIED">未指定</option>
          <option value="EXPIRED">期限切れ</option>
          <option value="HOLDING_LIMIT_EXCEEDED">保有上限超過</option>
          <option value="CORRECTION">訂正</option>
        </select>
      </label>
      <div className="actions">
        <button className="button danger" name="command" value="reverse" disabled={pending}>
          反対仕訳で取消す
        </button>
        {!formal ? (
          <button className="button secondary" name="command" value="pool" disabled={pending}>
            共通プールへ移行
          </button>
        ) : null}
      </div>
      {state.message ? (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
