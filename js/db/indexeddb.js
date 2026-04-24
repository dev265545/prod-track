/**
 * ProdTrack Lite - IndexedDB wrapper
 * Promise-based API for CRUD on all stores.
 */

import { DB_NAME, DB_VERSION, STORES, createSchema } from './schema.js';

let dbInstance = null;

/**
 * Open database; creates schema on first run or version upgrade.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (e) => {
      createSchema(e.target.result);
    };
  });
}

/**
 * Get store in read-only mode.
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} mode
 * @returns {IDBObjectStore}
 */
function getStore(db, storeName, mode = 'readonly') {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

/**
 * Get all records from a store.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export function getAll(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const store = getStore(db, storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Get one record by id.
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export function get(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const store = getStore(db, storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Put (add or update) one record.
 * @param {string} storeName
 * @param {object} record
 * @returns {Promise<void>}
 */
export function put(storeName, record) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const store = getStore(db, storeName, 'readwrite');
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Delete one record by id.
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<void>}
 */
export function remove(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const store = getStore(db, storeName, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Get all from store by index range (e.g. by date).
 * @param {string} storeName
 * @param {string} indexName
 * @param {IDBKeyRange} range
 * @returns {Promise<Array>}
 */
export function getAllByIndex(storeName, indexName, range = null) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const store = getStore(db, storeName);
      const index = store.index(indexName);
      const request = range ? index.getAll(range) : index.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Delete all records in a store that match a predicate (by scanning).
 * Used for "delete historical data before date".
 * @param {string} storeName
 * @param {function(object): boolean} predicate
 * @returns {Promise<number>} count deleted
 */
export function deleteWhere(storeName, predicate) {
  return openDB().then((db) => {
    return getAll(storeName).then((rows) => {
      const toDelete = rows.filter(predicate);
      if (toDelete.length === 0) return Promise.resolve(0);
      return Promise.all(toDelete.map((r) => remove(storeName, r.id))).then(
        () => toDelete.length
      );
    });
  });
}

/**
 * Clear entire store (use with caution).
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export function clear(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const store = getStore(db, storeName, 'readwrite');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export { STORES };
