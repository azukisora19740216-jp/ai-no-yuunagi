import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { findAccessibleTransaction } from "@/modules/transactions/application/transaction-queries";
import { transactionStatusLabel, workloadLabel } from "@/modules/transactions/ui/labels";
import { ParticipantActionForm } from "@/modules/transactions/ui/participant-action-form";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireCurrentActor();
  const { id } = await params;
  const transaction = await findAccessibleTransaction(actor, id);
  if (!transaction) notFound();
  const isProvider = transaction.providerUserId === actor.id;
  const isRecipient = transaction.recipientUserId === actor.id;

  return (
    <main className="narrow">
      <p className="status">{transactionStatusLabel[transaction.status]}</p>
      <h1>{transaction.item.title}</h1>
      <dl className="details">
        <dt>提供者</dt>
        <dd>{transaction.provider.profile?.displayName ?? "会員"}</dd>
        <dt>受取人</dt>
        <dd>{transaction.recipient.profile?.displayName ?? "会員"}</dd>
        <dt>受渡し方法</dt>
        <dd>
          {transaction.item.deliveryMethod === "HANDOVER" ? "対面手渡し" : "提供者の任意配送"}
        </dd>
        <dt>配送協力区分</dt>
        <dd>{workloadLabel[transaction.shippingWorkloadLevel]}</dd>
        <dt>現実の引渡し日時（当事者報告）</dt>
        <dd>
          {transaction.handoverOccurredAt
            ? transaction.handoverOccurredAt.toLocaleString("ja-JP")
            : "未報告"}
        </dd>
        <dt>双方報告が揃った日時</dt>
        <dd>
          {transaction.bothReportedAt
            ? transaction.bothReportedAt.toLocaleString("ja-JP")
            : "未完了"}
        </dd>
        <dt>運営確認日時</dt>
        <dd>
          {transaction.adminFinalizedAt
            ? transaction.adminFinalizedAt.toLocaleString("ja-JP")
            : "未確認"}
        </dd>
      </dl>
      <p className="notice-inline">
        当事者の完了報告と運営確認は別の記録です。運営確認は運営上の取引確定とポイント付与条件です。
      </p>

      <section>
        <h2>次の操作</h2>
        <div className="actions">
          {transaction.status === "RECIPIENT_SELECTED" && isRecipient ? (
            <ParticipantActionForm
              transactionId={transaction.id}
              command="accept"
              label="受取人として承諾する"
            />
          ) : null}
          {transaction.status === "ACCEPTED" && (isProvider || isRecipient) ? (
            <ParticipantActionForm
              transactionId={transaction.id}
              command="schedule"
              label="受渡し準備を確認する"
            />
          ) : null}
          {(transaction.status === "HANDOVER_SCHEDULED" ||
            transaction.status === "RECIPIENT_REPORTED_COMPLETE") &&
          isProvider ? (
            <ParticipantActionForm
              transactionId={transaction.id}
              command="report-provider"
              label="引渡し完了を報告する"
            />
          ) : null}
          {(transaction.status === "HANDOVER_SCHEDULED" ||
            transaction.status === "PROVIDER_REPORTED_COMPLETE") &&
          isRecipient ? (
            <ParticipantActionForm
              transactionId={transaction.id}
              command="report-recipient"
              label="受領完了を報告する"
            />
          ) : null}
          {transaction.status === "UNDER_ADMIN_REVIEW" ? (
            <p>双方の報告が揃い、運営確認中です。ポイントはまだ確定していません。</p>
          ) : null}
          {transaction.status === "COMPLETED" ? (
            <p className="success">双方報告後の運営確認が完了しました。</p>
          ) : null}
          {transaction.status === "DISPUTED" ? (
            <p className="error">確認事項があるため、ポイント付与は保留中です。</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2>状態履歴</h2>
        <ol className="timeline">
          {transaction.statusEvents.map((event) => (
            <li key={event.id}>
              <strong>{transactionStatusLabel[event.toStatus]}</strong>
              <span>{event.createdAt.toLocaleString("ja-JP")}</span>
              <p>{event.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
