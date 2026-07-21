"use client";

import { useActionState } from "react";
import { runPointExpiryAction } from "@/app/points/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function RunExpiryForm() {
  const [state, action, pending] = useActionState(runPointExpiryAction, initialActionState);
  return (
    <form action={action} className="review-form">
      <p>期限到来分だけを、元仕訳を変えずに共通プールへ追記移行します。</p>
      <button className="button" disabled={pending}>
        期限到来分を確認・追記処理
      </button>
      {state.message ? <p className={state.ok ? "success" : "error"}>{state.message}</p> : null}
    </form>
  );
}
