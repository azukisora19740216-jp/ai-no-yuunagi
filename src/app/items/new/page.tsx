import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { requirePermission } from "@/modules/identity/domain/authorization";
import { listActiveCategories } from "@/modules/items/application/item-queries";
import { ItemForm } from "@/modules/items/ui/item-form";

export default async function NewItemPage() {
  const actor = await requireCurrentActor();
  requirePermission(actor.roles, "item:create");
  const categories = await listActiveCategories();
  return (
    <main className="narrow">
      <h1>提供物品を登録</h1>
      <ItemForm categories={categories} />
    </main>
  );
}
