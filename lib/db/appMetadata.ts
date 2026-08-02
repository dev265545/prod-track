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

/**
 * The persisted `_app` row. Extends the pure `AppDbRecord` shape with the
 * session nonce used to invalidate live sessions when the admin password is
 * rotated (see `lib/auth.ts`).
 */
export type AppDbRecordWithSession = AppDbRecord & {
  /** Rotated on every password change; sessions carrying a stale nonce are dead. */
  sessionNonce?: string | null;
};

const APP_ROW_ID = "_app";

function normalizeAppRow(
  row: Record<string, unknown> | null,
): AppDbRecordWithSession | null {
  if (!row) return null;
  return {
    id: "_app",
    onboardingComplete: !!row.onboardingComplete,
    passwordHash:
      typeof row.passwordHash === "string" ? row.passwordHash : null,
    workerPasswordHash:
      typeof row.workerPasswordHash === "string" ? row.workerPasswordHash : null,
    sessionNonce:
      typeof row.sessionNonce === "string" ? row.sessionNonce : null,
  };
}

export async function getAppDbRecord(): Promise<AppDbRecordWithSession | null> {
  await openDB();
  const row = await get(METADATA_STORE, APP_ROW_ID);
  return normalizeAppRow(row);
}

export async function upsertAppDbRecord(
  partial: Partial<Omit<AppDbRecordWithSession, "id">>,
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

/**
 * True when this workspace already has a usable admin credential, in the DB row
 * or in the localStorage fallback used by pre-`_app` web installs.
 *
 * Read inline rather than via `lib/auth`'s `hasAppPassword()` to avoid an
 * import cycle (auth depends on this module).
 */
async function hasStoredAdminCredential(): Promise<boolean> {
  const meta = await getAppDbRecord();
  if (meta?.passwordHash) return true;
  if (typeof localStorage === "undefined") return false;
  return !!localStorage.getItem("prodtrack_app_password_hash");
}

export async function shouldOpenLoginInsteadOfOnboarding(): Promise<boolean> {
  const meta = await getAppDbRecord();
  const legacy = await legacyWorkspaceHasData();
  if (!shouldRouteToLoginAfterDbOpen(meta, legacy)) return false;
  // There is no default password any more: a workspace with no credential must
  // go through onboarding to set one, otherwise the login screen is a dead end.
  // Onboarding only writes the password, so existing business data survives.
  return hasStoredAdminCredential();
}

export { shouldRouteToLoginAfterDbOpen };
