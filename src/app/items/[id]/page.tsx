import { notFound } from "next/navigation";
import { getCurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { findVisibleItem } from "@/modules/items/application/item-queries";
import { conditionLabel, itemStatusLabel } from "@/modules/items/ui/labels";
import { RequestForm } from "@/modules/item-requests/ui/request-form";

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, actor] = await Promise.all([findVisibleItem(id), getCurrentActor()]);
  if (!item) notFound();
  const canRequest =
    actor &&
    actor.id !== item.ownerUserId &&
    item.status === "PUBLISHED" &&
    hasPermission(actor.roles, "item-request:create");
  const dates = Array.isArray(item.availableDates)
    ? item.availableDates.filter((v): v is string => typeof v === "string")
    : [];
  return (
    <main className="narrow">
      <p className="status">{itemStatusLabel[item.status]}</p>
      <h1>{item.title}</h1>
      <dl className="details">
        <dt>提供者</dt>
        <dd>{item.owner.profile?.displayName ?? "会員"}</dd>
        <dt>カテゴリー</dt>
        <dd>{item.category.name}</dd>
        <dt>状態</dt>
        <dd>{conditionLabel[item.condition]}</dd>
        <dt>受渡し地域</dt>
        <dd>{item.handoverArea}</dd>
        <dt>受渡し方法</dt>
        <dd>{item.deliveryMethod === "HANDOVER" ? "対面手渡し" : "提供者の任意配送"}</dd>
        <dt>対応可能日時</dt>
        <dd>{dates.join("、")}</dd>
      </dl>
      <section>
        <h2>説明</h2>
        <p className="preserve-lines">{item.description}</p>
        {item.defectDescription ? (
          <>
            <h2>傷・不具合</h2>
            <p>{item.defectDescription}</p>
          </>
        ) : null}
      </section>
      <p className="notice-inline">
        この物品は無償です。物品代金・送料・謝礼などの金銭授受はできません。
      </p>
      {canRequest ? (
        <section>
          <h2>受取りを申し込む</h2>
          <RequestForm itemId={item.id} />
        </section>
      ) : actor?.id === item.ownerUserId ? (
        <p>自分の物品には申込みできません。</p>
      ) : item.status !== "PUBLISHED" ? (
        <p>受取人が選択済みです。</p>
      ) : !actor ? (
        <p>申込みにはログインが必要です。</p>
      ) : null}
    </main>
  );
}
