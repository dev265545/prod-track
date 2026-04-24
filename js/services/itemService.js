/**
 * ProdTrack Lite - Items (products) CRUD
 */

import { getAll, get, put, remove, STORES } from '../db/indexeddb.js';

const STORE = STORES.ITEMS;

export async function getItems() {
  return getAll(STORE);
}

export async function getItem(id) {
  return get(STORE, id);
}

export async function saveItem(item) {
  if (!item.id) item.id = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  await put(STORE, item);
  return item;
}

export async function deleteItem(id) {
  await remove(STORE, id);
}
