import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { getAdminPointLedger } from "@/modules/points/application/point-ledger-queries";
import { ManagePointForm } from "@/modules/points/ui/manage-point-form";
import { pointEventLabel, pointStatusLabel } from "@/modules/transactions/ui/labels";
import { RunExpiryForm } from "@/modules/points/ui/run-expiry-form";

const poolReasonLabel = {
  UNSPECIFIED: "未指定",
  EXPIRED: "期限切れ",
  HOLDING_LIMIT_EXCEEDED: "保有上限超過",
  CORRECTION: "訂正",
} as const;

export default async function AdminPointsPage() {
  const actor = await requireCurrentActor();
  if (!hasPermission(actor.roles, "points:read-all")) notFound();
  const canManage = hasPermission(actor.roles, "points:reverse");
  const ledger = await getAdminPointLedger();
  return (
    <main>
      <h1>ポイント台帳</h1>
      <section className="balance-card">
        <p>共通おかげさまプール</p>
        <strong>{ledger.commonPoolBalance} ポイント</strong>
      </section>
      <p>うち正式movement由来: {ledger.formalCommonPoolBalance} ポイント</p>
      <p className="notice-inline">
        現金・寄付原資とは別の台帳です。残高の直接上書きはできません。
      </p>
      <section>
        <h2>利用者ポイント台帳</h2>
        <div className="stack-list">
          {ledger.entries.map((entry) => (
            <article className="card" key={entry.id}>
              <p className="status">{pointStatusLabel[entry.status]}</p>
              <h3>
                {pointEventLabel[entry.eventType]}: {entry.points > 0 ? "+" : ""}
                {entry.points}ポイント
              </h3>
              <p>
                利用者: {entry.user.profile?.displayName ?? "会員"}／物品:{" "}
                {entry.transaction?.item.title ?? "―"}
              </p>
              <p>{entry.reason}</p>
              <p>
                区分: {entry.policyVersionId ? "正式" : "開発用・非正式"}
                {entry.expiresAt ? `／期限: ${entry.expiresAt.toLocaleString("ja-JP")}` : ""}
              </p>
              {canManage && entry.status === "POSTED" && entry.points > 0 && !entry.reversal ? (
                <ManagePointForm entryId={entry.id} formal={entry.policyVersionId !== null} />
              ) : null}
            </article>
          ))}
        </div>
      </section>
      {canManage ? (
        <section>
          <h2>期限処理</h2>
          <RunExpiryForm />
        </section>
      ) : null}
      <section>
        <h2>失効通知予定</h2>
        {ledger.notifications.length ? (
          <ol className="timeline">
            {ledger.notifications.map((notice) => (
              <li key={notice.id}>
                <strong>
                  {notice.user.profile?.displayName ?? "会員"}: {notice.noticeDays}日前
                </strong>
                <span>
                  {notice.scheduledFor.toLocaleString("ja-JP")}・{notice.status}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>通知予定はありません。</p>
        )}
      </section>
      <section>
        <h2>共通プール履歴</h2>
        {ledger.commonPoolEntries.length ? (
          <ol className="timeline">
            {ledger.commonPoolEntries.map((entry) => (
              <li key={entry.id}>
                <strong>+{entry.points}ポイント</strong>
                <span>
                  {poolReasonLabel[entry.reasonCategory]}・{entry.createdAt.toLocaleString("ja-JP")}
                </span>
                <p>{entry.reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>共通プール履歴はありません。</p>
        )}
      </section>
    </main>
  );
}
