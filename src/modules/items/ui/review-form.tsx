"use client";

import { useActionState } from "react";
import { reviewItemAction } from "@/app/items/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function ReviewForm({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState(reviewItemAction, initialActionState);
  return (
    <form className="review-form" action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <label>
        判断理由
        <input name="reason" required maxLength={500} />
      </label>
      <div className="actions">
        <button className="button" name="decision" value="approve" disabled={pending}>
          承認して公開
        </button>
        <button className="button danger" name="decision" value="reject" disabled={pending}>
          差戻し
        </button>
      </div>
      {state.message ? (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
