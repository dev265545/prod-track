/**
 * ProdTrack Lite - IndexedDB wrapper (web backend)
 */

import { DB_NAME, DB_VERSION, METADATA_STORE, STORES } from "./schema";

let dbInstance: IDBDatabase | null = null;

function createSchema(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(METADATA_STORE)) {
    db.createObjectStore(METADATA_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.ITEMS)) {
    db.createObjectStore(STORES.ITEMS, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.EMPLOYEES)) {
    db.createObjectStore(STORES.EMPLOYEES, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.PRODUCTIONS)) {
    const prodStore = db.createObjectStore(STORES.PRODUCTIONS, { keyPath: "id" });
    prodStore.createIndex("by_date", "date", { unique: false });
    prodStore.createIndex("by_employee", "employeeId", { unique: false });
    prodStore.createIndex("by_item", "itemId", { unique: false });
    prodStore.createIndex("employee_date", ["employeeId", "date"], {
      unique: false,
    });
  }
  if (!db.objectStoreNames.contains(STORES.ADVANCES)) {
    const advStore = db.createObjectStore(STORES.ADVANCES, { keyPath: "id" });
    advStore.createIndex("by_employee", "employeeId", { unique: false });
    advStore.createIndex("by_date", "date", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.ADVANCE_DEDUCTIONS)) {
    const dedStore = db.createObjectStore(STORES.ADVANCE_DEDUCTIONS, {
      keyPath: "id",
    });
    dedStore.createIndex("by_employee", "employeeId", { unique: false });
    dedStore.createIndex("employee_period", ["employeeId", "periodFrom"], {
      unique: true,
    });
  }
  if (!db.objectStoreNames.contains(STORES.SHIFTS)) {
    db.createObjectStore(STORES.SHIFTS, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.SALARY_RECORDS)) {
    const salStore = db.createObjectStore(STORES.SALARY_RECORDS, {
      keyPath: "id",
    });
    salStore.createIndex("by_employee", "employeeId", { unique: false });
    salStore.createIndex("by_month", "month", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.FACTORY_HOLIDAYS)) {
    db.createObjectStore(STORES.FACTORY_HOLIDAYS, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
    db.createObjectStore(STORES.ATTENDANCE, { keyPath: "id" });
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
      createSchema((e.target as IDBOpenDBRequest).result);
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
