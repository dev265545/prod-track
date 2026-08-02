/**
 * One versioned configuration row for the whole app.
 *
 * Shape and defaults come from
 * `docs/superpowers/specs/2026-07-29-admin-configuration-design.md`. Only the
 * flags that have a consumer today are read anywhere; the rest are carried so
 * later work adds a switch, not a storage mechanism.
 *
 * Storage is the schema-less `_metadata` store, so no migration is needed: an
 * install that has never opened Settings simply has no row, and
 * {@link getAppSettings} returns the defaults. Defaults are chosen to keep
 * today's behaviour, so first run after this change looks identical.
 */

import { get, put, remove } from "@/lib/db/adapter";
import { METADATA_STORE } from "@/lib/db/schema";

export const APP_SETTINGS_ID = "app_settings";
export const APP_SETTINGS_VERSION = 1;

export interface AppSettings {
  id: typeof APP_SETTINGS_ID;
  version: number;
  companyName: string;
  defaultShift: "day" | "night";
  weekStartsOn: 0 | 1;
  productionEnabled: boolean;
  productionRequiresEmployee: boolean;
  productionRequiresShift: boolean;
  /** Production picker reads the stock list, and output draws stock down. */
  productionInventoryLinkEnabled: boolean;
  inventoryBomDeductionsEnabled: boolean;
  stickerMultiplier: number;
  lowStockWarningsEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: APP_SETTINGS_ID,
  version: APP_SETTINGS_VERSION,
  companyName: "",
  defaultShift: "day",
  weekStartsOn: 1,
  productionEnabled: true,
  productionRequiresEmployee: true,
  productionRequiresShift: true,
  productionInventoryLinkEnabled: true,
  inventoryBomDeductionsEnabled: true,
  stickerMultiplier: 2,
  lowStockWarningsEnabled: true,
};

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Turn anything at all into a usable settings object.
 *
 * Every field is checked independently: a row half-written by an older build,
 * or hand-edited to nonsense, still yields a complete valid object rather than
 * throwing on the first bad field.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const multiplier = Number(row.stickerMultiplier);
  return {
    id: APP_SETTINGS_ID,
    version: APP_SETTINGS_VERSION,
    companyName:
      typeof row.companyName === "string"
        ? row.companyName.slice(0, 120)
        : DEFAULT_APP_SETTINGS.companyName,
    defaultShift: row.defaultShift === "night" ? "night" : "day",
    weekStartsOn: row.weekStartsOn === 0 ? 0 : 1,
    productionEnabled: boolOr(row.productionEnabled, true),
    productionRequiresEmployee: boolOr(row.productionRequiresEmployee, true),
    productionRequiresShift: boolOr(row.productionRequiresShift, true),
    productionInventoryLinkEnabled: boolOr(
      row.productionInventoryLinkEnabled,
      true,
    ),
    inventoryBomDeductionsEnabled: boolOr(
      row.inventoryBomDeductionsEnabled,
      true,
    ),
    stickerMultiplier:
      Number.isFinite(multiplier) && multiplier >= 0 && multiplier <= 20
        ? multiplier
        : DEFAULT_APP_SETTINGS.stickerMultiplier,
    lowStockWarningsEnabled: boolOr(row.lowStockWarningsEnabled, true),
  };
}

/**
 * Merge a patch onto current settings, ignoring unknown keys.
 *
 * Pure so the merge/validation rules can be tested without a database.
 */
export function mergeAppSettings(
  current: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  const merged: Record<string, unknown> = { ...current };
  for (const key of Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]) {
    if (key === "id" || key === "version") continue;
    if (patch[key] !== undefined) merged[key] = patch[key];
  }
  return normalizeAppSettings(merged);
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const row = await get(METADATA_STORE, APP_SETTINGS_ID);
    // No row is the normal state for every install that predates this
    // feature — defaults, not an error.
    return normalizeAppSettings(row);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function saveAppSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getAppSettings();
  const next = mergeAppSettings(current, patch);
  await put(METADATA_STORE, next as unknown as Record<string, unknown>);
  return next;
}

export async function resetAppSettings(): Promise<AppSettings> {
  try {
    await remove(METADATA_STORE, APP_SETTINGS_ID);
  } catch {
    /* nothing stored yet */
  }
  return { ...DEFAULT_APP_SETTINGS };
}

/**
 * Settings for a backup file, and the reverse.
 *
 * Kept here rather than in `exportImport` so the store name and row id stay in
 * one place: `_metadata` is deliberately excluded from the store loop there, so
 * the settings row travels as its own top-level field.
 */
export async function exportAppSettings(): Promise<AppSettings> {
  return getAppSettings();
}

export async function importAppSettings(raw: unknown): Promise<void> {
  if (raw == null) return;
  await put(
    METADATA_STORE,
    normalizeAppSettings(raw) as unknown as Record<string, unknown>,
  );
}
