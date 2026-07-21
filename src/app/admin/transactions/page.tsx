import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { listAdminTransactions } from "@/modules/transactions/application/transaction-queries";
import { CompletionReviewForm } from "@/modules/transactions/ui/completion-review-form";
import { transactionStatusLabel } from "@/modules/transactions/ui/labels";

export default async function AdminTransactionsPage() {
  const actor = await requireCurrentActor();
  if (!hasPermission(actor.roles, "transaction:read-all")) notFound();
  const canReview = hasPermission(actor.roles, "transaction:review");
  const transactions = await listAdminTransactions();
  return (
    <main>
      <h1>取引確認</h1>
      <p>双方の完了報告、禁止品・金銭授受・未着等の確認後に判断してください。</p>
      {transactions.length ? (
        <div className="stack-list">
          {transactions.map((transaction) => (
            <article className="card" key={transaction.id}>
              <p className="status">{transactionStatusLabel[transaction.status]}</p>
              <h2>{transaction.item.title}</h2>
              <p>
                提供者: {transaction.provider.profile?.displayName ?? "会員"}／受取人:{" "}
                {transaction.recipient.profile?.displayName ?? "会員"}
              </p>
              <p>
                提供者報告: {transaction.providerReportedAt ? "あり" : "なし"}／受取人報告:{" "}
                {transaction.recipientReportedAt ? "あり" : "なし"}
              </p>
              <p>
                双方報告済み:{" "}
                {transaction.bothReportedAt
                  ? transaction.bothReportedAt.toLocaleString("ja-JP")
                  : "未完了"}
                ／運営確認済み:{" "}
                {transaction.adminFinalizedAt
                  ? transaction.adminFinalizedAt.toLocaleString("ja-JP")
                  : "未確認"}
              </p>
              <p>
                <Link href={`/transactions/${transaction.id}`}>状態履歴を確認</Link>
              </p>
              {canReview && ["UNDER_ADMIN_REVIEW", "DISPUTED"].includes(transaction.status) ? (
                <CompletionReviewForm
                  transactionId={transaction.id}
                  handoverOnly={transaction.item.deliveryMethod === "HANDOVER"}
                  held={transaction.status === "DISPUTED"}
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p>確認対象の取引はありません。</p>
      )}
    </main>
  );
}
