/**
 * ProdTrack Lite - IndexedDB wrapper (web backend)
 */

import { DB_NAME, DB_VERSION, METADATA_STORE, STORES } from "./schema";
import {
  INDEXES,
  applyIndexReadOptions,
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
  type IndexKey,
  type IndexReadOptions,
} from "./indexes";

let dbInstance: IDBDatabase | null = null;

/**
 * Brings one store's indexes up to `INDEXES`.
 *
 * Runs on every upgrade, for new *and* pre-existing stores: `createSchema`
 * only touches stores that are absent, so an install created at an older
 * DB_VERSION would otherwise keep its object store forever and never gain the
 * indexes added later. Only missing indexes are created, so this is idempotent
 * and never rebuilds one that is already populated.
 */
function ensureIndexes(store: IDBObjectStore, storeName: string) {
  const wanted = INDEXES[storeName];
  if (!wanted) return;
  for (const [indexName, spec] of Object.entries(wanted)) {
    if (store.indexNames.contains(indexName)) continue;
    store.createIndex(indexName, spec.keyPath, { unique: spec.unique === true });
  }
}

function createSchema(db: IDBDatabase, tx: IDBTransaction | null) {
  const allStores = [METADATA_STORE, ...Object.values(STORES)];
  for (const name of allStores) {
    const store = db.objectStoreNames.contains(name)
      ? tx?.objectStore(name)
      : db.createObjectStore(name, { keyPath: "id" });
    if (store) ensureIndexes(store, name);
  }
}

function getStore(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode = "readonly"
) {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (e) => {
      const req = e.target as IDBOpenDBRequest;
      createSchema(req.result, req.transaction);
    };
  });
}

export function getAll(storeName: string): Promise<Record<string, unknown>[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = getStore(db, storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      })
  );
}

/**
 * Rows whose index key falls in the inclusive range `[lower, upper]`.
 *
 * This is the whole point of declaring the indexes: it reads only the matching
 * records out of the store instead of deserialising every row in it. Falls back
 * to a scan if the index is missing, which can happen on a database whose
 * upgrade transaction was interrupted — a slow answer beats a thrown one.
 */
export function getByIndex(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey
): Promise<Record<string, unknown>[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = getStore(db, storeName);
        if (!store.indexNames.contains(indexName)) {
          const keyPath = getIndexKeyPath(storeName, indexName);
          if (!keyPath) {
            reject(new Error(`Unknown index ${storeName}.${indexName}`));
            return;
          }
          const scan = store.getAll();
          scan.onsuccess = () =>
            resolve(
              sortByIndexOrder(
                (scan.result || []).filter((row) =>
                  matchesIndexRange(row, keyPath, lower, upper)
                ),
                keyPath
              )
            );
          scan.onerror = () => reject(scan.error);
          return;
        }
        const request = store
          .index(indexName)
          .getAll(IDBKeyRange.bound(lower, upper));
        // Already in index order from IndexedDB itself; nothing to sort.
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      })
  );
}

export function get(
  storeName: string,
  id: string
): Promise<Record<string, unknown> | null> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = getStore(db, storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      })
  );
}

export function put(
  storeName: string,
  record: Record<string, unknown>
): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = getStore(db, storeName, "readwrite");
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

export function remove(storeName: string, id: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = getStore(db, storeName, "readwrite");
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

export function deleteWhere(
  storeName: string,
  predicate: (row: Record<string, unknown>) => boolean
): Promise<number> {
  return openDB().then(() =>
    getAll(storeName).then((rows) => {
      const toDelete = rows.filter(predicate);
      if (toDelete.length === 0) return 0;
      return Promise.all(toDelete.map((r) => remove(storeName, r.id as string))).then(
        () => toDelete.length
      );
    })
  );
}

export function clear(storeName: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = getStore(db, storeName, "readwrite");
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

export { STORES };
