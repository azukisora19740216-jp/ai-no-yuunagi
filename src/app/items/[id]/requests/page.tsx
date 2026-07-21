import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { listRequestsForOwnedItem } from "@/modules/items/application/item-queries";
import { itemStatusLabel } from "@/modules/items/ui/labels";
import { SelectRequestForm } from "@/modules/item-requests/ui/select-request-form";

export default async function ItemRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCurrentActor();
  const { id } = await params;
  const item = await listRequestsForOwnedItem(actor.id, id);
  if (!item) notFound();
  return (
    <main className="narrow">
      <h1>受取申込み</h1>
      <h2>{item.title}</h2>
      <p className="status">物品: {itemStatusLabel[item.status]}</p>
      {item.requests.length ? (
        <ul className="stack-list">
          {item.requests.map((request) => (
            <li className="card" key={request.id}>
              <p className="status">
                {request.status === "REQUESTED"
                  ? "選択待ち"
                  : request.status === "SELECTED"
                    ? "選択済み"
                    : "未選択"}
              </p>
              <h3>{request.requester.profile?.displayName ?? "会員"}</h3>
              <p className="preserve-lines">{request.message}</p>
              {item.status === "PUBLISHED" && request.status === "REQUESTED" ? (
                <SelectRequestForm itemId={item.id} requestId={request.id} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>申込みはありません。</p>
      )}
    </main>
  );
}
