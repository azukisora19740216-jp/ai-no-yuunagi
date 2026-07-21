import Link from "next/link";
import { listPublishedItems } from "@/modules/items/application/item-queries";
import { conditionLabel } from "@/modules/items/ui/labels";

export default async function ItemsPage() {
  const items = await listPublishedItems();
  return (
    <main>
      <h1>公開中の物品</h1>
      <p>すべて無償譲渡です。金銭や謝礼との交換はできません。</p>
      {items.length ? (
        <div className="card-grid">
          {items.map((item) => (
            <article className="card" key={item.id}>
              <p className="status">公開中</p>
              <h2>{item.title}</h2>
              <dl>
                <dt>カテゴリー</dt>
                <dd>{item.category.name}</dd>
                <dt>状態</dt>
                <dd>{conditionLabel[item.condition]}</dd>
                <dt>受渡し地域</dt>
                <dd>{item.handoverArea}</dd>
                <dt>申込み</dt>
                <dd>{item._count.requests}件</dd>
              </dl>
              <Link href={`/items/${item.id}`}>詳細を見る</Link>
            </article>
          ))}
        </div>
      ) : (
        <p>現在公開中の物品はありません。</p>
      )}
    </main>
  );
}
