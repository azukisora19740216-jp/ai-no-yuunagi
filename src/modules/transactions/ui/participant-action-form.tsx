"use client";

import { useActionState } from "react";
import { participantTransactionAction } from "@/app/transactions/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function ParticipantActionForm({
  transactionId,
  command,
  label,
}: {
  transactionId: string;
  command: "accept" | "schedule" | "report-provider" | "report-recipient";
  label: string;
}) {
  const [state, action, pending] = useActionState(participantTransactionAction, initialActionState);
  return (
    <form action={action}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="command" value={command} />
      {command === "report-provider" || command === "report-recipient" ? (
        <label>
          現実の引渡し日時（当事者からの報告）
          <input name="handoverOccurredAt" type="datetime-local" required />
        </label>
      ) : null}
      <button className="button" disabled={pending}>
        {pending ? "処理中…" : label}
      </button>
      {state.message ? (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
