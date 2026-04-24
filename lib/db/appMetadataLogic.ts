/**
 * Pure helpers for DB app metadata (easy to unit test without SQLite/IndexedDB).
 */

export type AppDbRecord = {
  id: "_app";
  onboardingComplete: boolean;
  /** SHA-256 hex of app password; null for legacy DBs before metadata existed. */
  passwordHash: string | null;
};

/** After opening an existing workspace file, should we go to login instead of setup wizard? */
export function shouldRouteToLoginAfterDbOpen(
  meta: AppDbRecord | null,
  legacyHasBusinessData: boolean,
): boolean {
  if (meta?.onboardingComplete) return true;
  // Pre–metadata DBs: treat workspaces that already have saves as "returning".
  if (meta == null && legacyHasBusinessData) return true;
  return false;
}
