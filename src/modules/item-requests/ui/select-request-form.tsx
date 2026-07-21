"use client";

import { useActionState } from "react";
import { selectRequestAction } from "@/app/items/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function SelectRequestForm({ itemId, requestId }: { itemId: string; requestId: string }) {
  const [state, action, pending] = useActionState(selectRequestAction, initialActionState);
  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="requestId" value={requestId} />
      <button className="button" disabled={pending}>
        この人を受取人に選ぶ
      </button>
      {state.message ? (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
