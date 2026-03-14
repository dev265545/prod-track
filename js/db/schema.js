/**
 * ProdTrack Lite - IndexedDB Schema
 * DB: prodtrack-db, Version: 2
 */

const DB_NAME = 'prodtrack-db';
const DB_VERSION = 2;

const STORES = {
  ITEMS: 'items',
  EMPLOYEES: 'employees',
  PRODUCTIONS: 'productions',
  ADVANCES: 'advances',
  ADVANCE_DEDUCTIONS: 'advance_deductions',
};

function createSchema(db) {
  if (!db.objectStoreNames.contains(STORES.ITEMS)) {
    db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORES.EMPLOYEES)) {
    db.createObjectStore(STORES.EMPLOYEES, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORES.PRODUCTIONS)) {
    const prodStore = db.createObjectStore(STORES.PRODUCTIONS, { keyPath: 'id' });
    prodStore.createIndex('by_date', 'date', { unique: false });
    prodStore.createIndex('by_employee', 'employeeId', { unique: false });
    prodStore.createIndex('by_item', 'itemId', { unique: false });
    prodStore.createIndex('employee_date', ['employeeId', 'date'], { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.ADVANCES)) {
    const advStore = db.createObjectStore(STORES.ADVANCES, { keyPath: 'id' });
    advStore.createIndex('by_employee', 'employeeId', { unique: false });
    advStore.createIndex('by_date', 'date', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.ADVANCE_DEDUCTIONS)) {
    const dedStore = db.createObjectStore(STORES.ADVANCE_DEDUCTIONS, { keyPath: 'id' });
    dedStore.createIndex('by_employee', 'employeeId', { unique: false });
    dedStore.createIndex('employee_period', ['employeeId', 'periodFrom'], { unique: true });
  }
}

export { DB_NAME, DB_VERSION, STORES, createSchema };
