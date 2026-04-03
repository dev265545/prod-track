/**
 * Persist FileSystemFileHandle for the main SQLite file (Chrome/Edge File System Access API).
 */

const META_DB = "prodtrack-sqlite-meta";
const META_STORE = "handle";
const META_KEY = "main";

export type StoredSqliteFileInfo = {
  /** Display name (file name); full path is not available in the browser. */
  displayName: string;
};

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = (req as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
  });
}

export async function saveMainSqliteHandle(
  handle: FileSystemFileHandle,
  info: StoredSqliteFileInfo
): Promise<void> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(META_STORE).put({ handle, info }, META_KEY);
  });
}

export async function getStoredMainSqliteHandle(): Promise<{
  handle: FileSystemFileHandle;
  info: StoredSqliteFileInfo;
} | null> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(META_KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const v = req.result as
        | { handle: FileSystemFileHandle; info: StoredSqliteFileInfo }
        | undefined;
      resolve(v ?? null);
    };
  });
}

export async function clearStoredMainSqliteHandle(): Promise<void> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(META_STORE).delete(META_KEY);
  });
}
