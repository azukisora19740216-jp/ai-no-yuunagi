import Link from "next/link";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { listOwnItems } from "@/modules/items/application/item-queries";
import { itemStatusLabel } from "@/modules/items/ui/labels";
import { getPublicPilotRegistrationContext } from "@/modules/pilot/application/pilot-policy-service";
import { ReconsentForm } from "@/modules/pilot/ui/reconsent-form";

export default async function DashboardPage() {
  const actor = await requireCurrentActor();
  const items = await listOwnItems(actor.id);
  const canCreate = hasPermission(actor.roles, "item:create");
  const pilot = await getPublicPilotRegistrationContext();
  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>マイページ</h1>
          <p>{actor.name} さん</p>
        </div>
        {canCreate ? (
          <Link className="button" href="/items/new">
            物品を登録
          </Link>
        ) : null}
      </div>
      {!actor.emailVerified ? <p className="error">メールアドレスが未確認です。</p> : null}
      {pilot.enabled && pilot.available ? (
        <ReconsentForm termsVersion={pilot.termsVersion} privacyVersion={pilot.privacyVersion} />
      ) : null}
      <section>
        <h2>提供物品</h2>
        {items.length ? (
          <div className="stack-list">
            {items.map((item) => (
              <article className="card row-card" key={item.id}>
                <div>
                  <p className="status">{itemStatusLabel[item.status]}</p>
                  <h3>{item.title}</h3>
                  <p>
                    {item.category.name}・申込み {item._count.requests}件
                  </p>
                  {item.reviewReason ? (
                    <p className="error">審査理由: {item.reviewReason}</p>
                  ) : null}
                </div>
                <div className="actions">
                  {item.status === "DRAFT" || item.status === "REJECTED" ? (
                    <Link href={`/items/${item.id}/edit`}>編集</Link>
                  ) : null}
                  {item._count.requests > 0 ? (
                    <Link href={`/items/${item.id}/requests`}>申込みを確認</Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>登録した物品はありません。</p>
        )}
      </section>
    </main>
  );
}
