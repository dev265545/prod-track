/**
 * App-level metadata stored in `_metadata` (password hash, onboarding flag).
 * Same row works across browsers when the database file is the source of truth.
 */

import { get, getAll, put, openDB } from "./adapter";
import { METADATA_STORE, STORES } from "./schema";
import {
  shouldRouteToLoginAfterDbOpen,
  type AppDbRecord,
} from "./appMetadataLogic";

export type { AppDbRecord };

const APP_ROW_ID = "_app";

function normalizeAppRow(row: Record<string, unknown> | null): AppDbRecord | null {
  if (!row) return null;
  return {
    id: "_app",
    onboardingComplete: !!row.onboardingComplete,
    passwordHash:
      typeof row.passwordHash === "string" ? row.passwordHash : null,
  };
}

export async function getAppDbRecord(): Promise<AppDbRecord | null> {
  await openDB();
  const row = await get(METADATA_STORE, APP_ROW_ID);
  return normalizeAppRow(row);
}

export async function upsertAppDbRecord(
  partial: Partial<Omit<AppDbRecord, "id">>,
): Promise<void> {
  await openDB();
  const cur =
    normalizeAppRow(await get(METADATA_STORE, APP_ROW_ID)) ?? {
      id: "_app",
      onboardingComplete: false,
      passwordHash: null,
    };
  await put(METADATA_STORE, {
    ...cur,
    ...partial,
    id: APP_ROW_ID,
  });
}

/** True if any core store has rows (legacy DBs without `_app`). */
export async function legacyWorkspaceHasData(): Promise<boolean> {
  await openDB();
  for (const store of [
    STORES.EMPLOYEES,
    STORES.ITEMS,
    STORES.PRODUCTIONS,
  ] as const) {
    const rows = await getAll(store);
    if (rows.length > 0) return true;
  }
  return false;
}

export async function shouldOpenLoginInsteadOfOnboarding(): Promise<boolean> {
  const meta = await getAppDbRecord();
  const legacy = await legacyWorkspaceHasData();
  return shouldRouteToLoginAfterDbOpen(meta, legacy);
}

export { shouldRouteToLoginAfterDbOpen };
