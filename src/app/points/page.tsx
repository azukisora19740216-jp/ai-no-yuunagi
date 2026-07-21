import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { getUserPointLedger } from "@/modules/points/application/point-ledger-queries";
import { pointEventLabel, pointStatusLabel } from "@/modules/transactions/ui/labels";

export default async function PointsPage() {
  const actor = await requireCurrentActor();
  requirePermission(actor.roles, "points:view-own");
  const ledger = await getUserPointLedger(actor.id);
  return (
    <main className="narrow">
      <h1>おかげさまポイント履歴</h1>
      <section className="balance-card" aria-label="確定ポイント残高">
        <p>{ledger.formalEnabled ? "正式な利用可能ポイント" : "開発用ポイント"}</p>
        <strong>{ledger.balance} ポイント</strong>
      </section>
      {ledger.formalEnabled ? (
        <p className="help">本番開始前・ポリシー版なしの開発仕訳は正式残高に含みません。</p>
      ) : (
        <p className="notice-inline">
          正式ポイント機能は無効です。表示値は開発用であり正式ポイントではありません。
        </p>
      )}
      <p className="notice-inline">
        ポイントは物品の対価ではありません。購入・換金・譲渡・送金や、物品・サービスの取得には使用できません。
      </p>
      <p>残高は確定済みの追記型台帳から都度集計しています。保留記録は残高に含みません。</p>
      {ledger.entries.length ? (
        <ol className="timeline">
          {ledger.entries.map((entry) => (
            <li key={entry.id}>
              <strong>
                {pointEventLabel[entry.eventType]}: {entry.points > 0 ? "+" : ""}
                {entry.points}ポイント
              </strong>
              <span>
                {pointStatusLabel[entry.status]}・{entry.createdAt.toLocaleString("ja-JP")}
              </span>
              <p>
                区分:{" "}
                {entry.policyVersion ? `正式（${entry.policyVersion.version}）` : "開発用・非正式"}
                {entry.expiresAt ? `／期限: ${entry.expiresAt.toLocaleString("ja-JP")}` : ""}
              </p>
              <p>{entry.transaction?.item.title ?? "共通プール・訂正記録"}</p>
              <p>{entry.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>ポイント履歴はありません。</p>
      )}
      {ledger.notifications.length ? (
        <section>
          <h2>失効通知予定</h2>
          <ol className="timeline">
            {ledger.notifications.map((notice) => (
              <li key={`${notice.pointEntryId}:${notice.noticeDays}`}>
                <strong>{notice.noticeDays}日前通知</strong>
                <span>
                  {notice.scheduledFor.toLocaleString("ja-JP")}・{notice.status}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
