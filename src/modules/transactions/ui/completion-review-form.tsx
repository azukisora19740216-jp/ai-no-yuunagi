"use client";

import { useActionState } from "react";
import { reviewTransactionAction } from "@/app/transactions/actions";
import { initialActionState } from "@/shared/ui/action-state";

export function CompletionReviewForm({
  transactionId,
  handoverOnly,
  held,
}: {
  transactionId: string;
  handoverOnly: boolean;
  held: boolean;
}) {
  const [state, action, pending] = useActionState(reviewTransactionAction, initialActionState);
  return (
    <form className="review-form" action={action}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <label>
        配送協力の作業区分
        <select name="shippingWorkloadLevel" defaultValue="NONE">
          <option value="NONE">加算なし（0ポイント）</option>
          {!handoverOnly ? (
            <>
              <option value="SIMPLE">簡易梱包・発送（1ポイント）</option>
              <option value="STANDARD">通常の宅配対応（2ポイント）</option>
              <option value="LARGE_SPECIAL">大型品・特殊梱包（3ポイント）</option>
            </>
          ) : null}
        </select>
      </label>
      <p className="help">送料額ではなく作業区分で判定します。1取引の合計上限は4ポイントです。</p>
      <label>
        確認理由
        <textarea name="reason" required maxLength={500} rows={4} />
      </label>
      <div className="actions">
        <button className="button" name="decision" value="APPROVE" disabled={pending}>
          運営確認してポイントを確定
        </button>
        {!held ? (
          <button className="button secondary" name="decision" value="HOLD" disabled={pending}>
            付与を保留
          </button>
        ) : null}
        <button className="button danger" name="decision" value="CANCEL" disabled={pending}>
          取引を取消し
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
