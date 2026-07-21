import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import {
  findOwnEditableItem,
  listActiveCategories,
} from "@/modules/items/application/item-queries";
import { ItemForm } from "@/modules/items/ui/item-form";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCurrentActor();
  const { id } = await params;
  const [draft, categories] = await Promise.all([
    findOwnEditableItem(actor.id, id),
    listActiveCategories(),
  ]);
  if (!draft) notFound();
  return (
    <main className="narrow">
      <h1>物品の下書きを編集</h1>
      <ItemForm categories={categories} draft={draft} />
    </main>
  );
}
