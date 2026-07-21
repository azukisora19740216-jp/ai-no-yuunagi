import Link from "next/link";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { listOwnTransactions } from "@/modules/transactions/application/transaction-queries";
import { transactionStatusLabel } from "@/modules/transactions/ui/labels";

export default async function TransactionsPage() {
  const actor = await requireCurrentActor();
  const transactions = await listOwnTransactions(actor.id);
  return (
    <main>
      <h1>取引</h1>
      <p>受取人選択後の承諾、受渡し、双方の完了報告、運営確認を順に記録します。</p>
      {transactions.length ? (
        <div className="stack-list">
          {transactions.map((transaction) => (
            <article className="card row-card" key={transaction.id}>
              <div>
                <p className="status">{transactionStatusLabel[transaction.status]}</p>
                <h2>{transaction.item.title}</h2>
                <p>あなたの立場: {transaction.providerUserId === actor.id ? "提供者" : "受取人"}</p>
              </div>
              <Link href={`/transactions/${transaction.id}`}>取引詳細</Link>
            </article>
          ))}
        </div>
      ) : (
        <p>対象の取引はありません。</p>
      )}
    </main>
  );
}
