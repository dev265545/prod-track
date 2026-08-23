/**
 * ProdTrack Lite - DB schema (shared by IndexedDB and SQLite).
 * Store names must match src-tauri/src/db.rs TABLES.
 */

export const DB_NAME = "prodtrack-db";
/** Bump when IndexedDB layout or SQLite migrations need to run (keep in sync with Tauri `CURRENT_SCHEMA_VERSION`). */
export const DB_VERSION = 12;

/** SQLite / IndexedDB table for `_schema`, `_app`, and other internal rows (not part of JSON export stores). */
export const METADATA_STORE = "_metadata";

export const STORES = {
  ITEMS: "items",
  EMPLOYEES: "employees",
  PRODUCTIONS: "productions",
  ADVANCES: "advances",
  ADVANCE_DEDUCTIONS: "advance_deductions",
  SHIFTS: "shifts",
  SALARY_RECORDS: "salary_records",
  SALARY_SHEET_OVERRIDES: "salary_sheet_overrides",
  FACTORY_HOLIDAYS: "factory_holidays",
  ATTENDANCE: "attendance",
  SUNDAY_CATEGORIES: "sunday_categories",
  OPERATOR_NATIONAL_HOLIDAYS: "operator_national_holidays",
  MACHINES: "machines",
  ITEM_COMBOS: "item_combos",
  INVENTORY_ITEMS: "inventory_items",
  INVENTORY_MOVEMENTS: "inventory_movements",
  /** Append-only security/audit trail. Never cleared by `clearAllData()`. */
  AUDIT_LOG: "audit_log",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];
