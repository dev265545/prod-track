import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

const STORE = STORES.ITEMS;

const ITEM_AUDIT_FIELDS = ["name", "code", "rate"] as const;

export async function getItems(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getItem(
  id: string
): Promise<Record<string, unknown> | null> {
  return get(STORE, id);
}

export async function saveItem(
  item: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let before: Record<string, unknown> | null = null;
  if (!item.id)
    item.id =
      "item_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  else before = await get(STORE, item.id as string);
  await put(STORE, item);
  const what = nameOnRow(item, "An item");
  void auditRecord(
    before ? AUDIT_ACTIONS.itemUpdate : AUDIT_ACTIONS.itemCreate,
    "items",
    item.id as string,
    before
      ? `Item ${what} was updated`
      : `Item ${what} was added to the item list`,
    diffEntity(before, item, ITEM_AUDIT_FIELDS),
  );
  return item;
}

export async function deleteItem(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.itemDelete,
    "items",
    id,
    `Item ${nameOnRow(before, "with no name")} was deleted`,
    diffEntity(before, null, ITEM_AUDIT_FIELDS),
  );
}
