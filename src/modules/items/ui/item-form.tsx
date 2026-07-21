"use client";

import { useActionState } from "react";
import { saveItemAction } from "@/app/items/actions";
import { initialActionState } from "@/shared/ui/action-state";

type Category = { id: string; name: string };
type Draft = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  defectDescription: string | null;
  deliveryMethod: string;
  handoverArea: string;
  availableDates: unknown;
  shippingSupported: boolean;
  reviewReason: string | null;
};

export function ItemForm({ categories, draft }: { categories: Category[]; draft?: Draft }) {
  const [state, action, pending] = useActionState(saveItemAction, initialActionState);
  const dates = Array.isArray(draft?.availableDates)
    ? draft.availableDates.filter((v): v is string => typeof v === "string").join("\n")
    : "";
  return (
    <form className="form-card" action={action}>
      {draft ? <input type="hidden" name="itemId" value={draft.id} /> : null}
      {draft?.reviewReason ? <p className="error">差戻し理由: {draft.reviewReason}</p> : null}
      <label>
        タイトル
        <input name="title" required maxLength={80} defaultValue={draft?.title} />
      </label>
      <label>
        説明
        <textarea
          name="description"
          required
          maxLength={2000}
          rows={7}
          defaultValue={draft?.description}
        />
      </label>
      <label>
        カテゴリー
        <select name="categoryId" required defaultValue={draft?.categoryId ?? ""}>
          <option value="" disabled>
            選択してください
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        状態
        <select name="condition" required defaultValue={draft?.condition ?? "GOOD"}>
          <option value="UNUSED">未使用</option>
          <option value="GOOD">状態良好</option>
          <option value="USED">使用感あり</option>
          <option value="NEEDS_REPAIR">修理・手入れが必要</option>
        </select>
      </label>
      <label>
        傷・不具合の説明
        <textarea
          name="defectDescription"
          maxLength={500}
          rows={3}
          defaultValue={draft?.defectDescription ?? ""}
        />
      </label>
      <label>
        受渡し方法
        <select name="deliveryMethod" required defaultValue={draft?.deliveryMethod ?? "HANDOVER"}>
          <option value="HANDOVER">対面手渡し</option>
          <option value="SHIPPING">提供者の任意配送</option>
        </select>
      </label>
      <label>
        受渡し地域
        <input name="handoverArea" required maxLength={100} defaultValue={draft?.handoverArea} />
      </label>
      <label>
        対応可能日時（1行に1件）
        <textarea name="availableDates" required rows={4} defaultValue={dates} />
      </label>
      <label className="check">
        <input name="shippingSupported" type="checkbox" defaultChecked={draft?.shippingSupported} />
        提供者として配送に対応できます
      </label>
      <p className="notice-inline">
        金額、希望価格、希望ポイントの入力欄はありません。送料を含む金銭授受はできません。
      </p>
      <p className="help">
        画像アップロードは安全な検証処理が未整備のため、このフェーズでは利用できません。
      </p>
      <div className="actions">
        <button className="button secondary" name="intent" value="save" disabled={pending}>
          下書き保存
        </button>
        <button className="button" name="intent" value="submit" disabled={pending}>
          投稿を申請
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
