/**
 * ProdTrack Lite - DB schema (shared by IndexedDB and SQLite)
 */

export const DB_NAME = "prodtrack-db";
export const DB_VERSION = 4;

export const STORES = {
  ITEMS: "items",
  EMPLOYEES: "employees",
  PRODUCTIONS: "productions",
  ADVANCES: "advances",
  ADVANCE_DEDUCTIONS: "advance_deductions",
  SHIFTS: "shifts",
  SALARY_RECORDS: "salary_records",
  FACTORY_HOLIDAYS: "factory_holidays",
  ATTENDANCE: "attendance",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];
