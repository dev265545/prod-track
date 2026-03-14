import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

const STORE = STORES.ITEMS;

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
  if (!item.id)
    item.id =
      "item_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  await put(STORE, item);
  return item;
}

export async function deleteItem(id: string): Promise<void> {
  await remove(STORE, id);
}
