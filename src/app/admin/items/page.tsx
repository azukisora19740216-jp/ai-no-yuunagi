import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { listPendingReviewItems } from "@/modules/items/application/item-queries";
import { conditionLabel } from "@/modules/items/ui/labels";
import { ReviewForm } from "@/modules/items/ui/review-form";

export default async function AdminItemsPage() {
  const actor = await requireCurrentActor();
  if (!hasPermission(actor.roles, "item:review")) notFound();
  const items = await listPendingReviewItems();
  return (
    <main>
      <h1>投稿審査</h1>
      <p>
        禁止品基準の正式資料が未配置のため、現在はseedされた保守的カテゴリーと人手確認を併用します。
      </p>
      {items.length ? (
        <div className="stack-list">
          {items.map((item) => (
            <article className="card" key={item.id}>
              <h2>{item.title}</h2>
              <dl>
                <dt>提供者</dt>
                <dd>{item.owner.profile?.displayName ?? "会員"}</dd>
                <dt>カテゴリー</dt>
                <dd>{item.category.name}</dd>
                <dt>状態</dt>
                <dd>{conditionLabel[item.condition]}</dd>
                <dt>受渡し</dt>
                <dd>
                  {item.deliveryMethod === "HANDOVER" ? "対面" : "任意配送"}・{item.handoverArea}
                </dd>
              </dl>
              <h3>説明</h3>
              <p className="preserve-lines">{item.description}</p>
              {item.defectDescription ? (
                <p>
                  <strong>不具合:</strong> {item.defectDescription}
                </p>
              ) : null}
              <ReviewForm itemId={item.id} />
            </article>
          ))}
        </div>
      ) : (
        <p>審査待ちの投稿はありません。</p>
      )}
    </main>
  );
}
