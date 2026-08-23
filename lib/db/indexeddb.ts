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
  upper: IndexKey,
  options?: IndexReadOptions
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
              applyIndexReadOptions(
                sortByIndexOrder(
                  (scan.result || []).filter((row) =>
                    matchesIndexRange(row, keyPath, lower, upper)
                  ),
                  keyPath
                ),
                options
              )
            );
          scan.onerror = () => reject(scan.error);
          return;
        }
        const index = store.index(indexName);
        const range = IDBKeyRange.bound(lower, upper);
        if (!options) {
          const request = index.getAll(range);
          // Already in index order from IndexedDB itself; nothing to sort.
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
          return;
        }
        // A cursor, not `getAll` plus a slice: `getAll` would structured-clone
        // the entire range before the caller ever discarded it, which for a
        // "newest 50 of 146,000" read is the whole cost of the query.
        const limit = options.limit;
        if (limit !== undefined && limit <= 0) {
          resolve([]);
          return;
        }
        let toSkip = Math.max(0, Math.floor(options.offset ?? 0));
        let skipped = false;
        const out: Record<string, unknown>[] = [];
        const request = index.openCursor(
          range,
          options.direction === "prev" ? "prev" : "next"
        );
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(out);
            return;
          }
          // `advance(0)` is a TypeError, so the skip is guarded rather than
          // issued unconditionally.
          if (!skipped && toSkip > 0) {
            skipped = true;
            cursor.advance(toSkip);
            return;
          }
          skipped = true;
          toSkip = 0;
          out.push(cursor.value as Record<string, unknown>);
          if (limit !== undefined && out.length >= limit) {
            resolve(out);
            return;
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      })
  );
}

/**
 * How many rows fall in `[lower, upper]`, without deserialising any of them.
 *
 * `IDBIndex.count` walks index keys only — no structured clone per record — so
 * this is what a "how many entries would this prune remove?" question should
 * cost, rather than reading the log into memory to call `.length` on it.
 */
export function countByIndex(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey
): Promise<number> {
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
              (scan.result || []).filter((row) =>
                matchesIndexRange(row, keyPath, lower, upper)
              ).length
            );
          scan.onerror = () => reject(scan.error);
          return;
        }
        const request = store
          .index(indexName)
          .count(IDBKeyRange.bound(lower, upper));
        request.onsuccess = () => resolve(request.result || 0);
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
