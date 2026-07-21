import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">物品循環プラットフォーム</p>
        <h1>藍の夕凪</h1>
        <p className="lead">
          使わなくなった物を、必要とする人へ。地域の無償譲渡を落ち着いて安全に進めるための試験運用版です。
        </p>
        <div className="actions">
          <Link className="button" href="/items">
            公開中の物品を見る
          </Link>
          <Link className="button secondary" href="/items/new">
            物品を提供する
          </Link>
        </div>
      </section>
      <section>
        <h2>大切にすること</h2>
        <div className="card-grid">
          <article className="card">
            <h3>無償譲渡に限定</h3>
            <p>物品代金、送料の支払い、謝礼など、利用者間の金銭決済機能はありません。</p>
          </article>
          <article className="card">
            <h3>人による確認</h3>
            <p>投稿は公開前に運営担当者が確認します。自動判定だけで利用者を処分しません。</p>
          </article>
          <article className="card">
            <h3>地域で試験運用</h3>
            <p>現在は全国公開ではなく、運用条件を確認するためのMVPです。</p>
          </article>
        </div>
      </section>
    </main>
  );
}
