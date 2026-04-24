/**
 * When first-run is already marked complete, we normally redirect off `/onboarding` to `/`.
 * Exceptions are required so users can re-link a .db after "forget file" or a missing handle.
 */

export function shouldRedirectCompletedUserFromOnboarding(
  pathname: string,
  /** `window.location.search`, e.g. `?relink=1` or `""` */
  search: string,
  options: {
    sqliteFileMode: boolean;
    hasStoredSqliteHandle: boolean;
  },
): boolean {
  if (pathname !== "/onboarding") {
    return false;
  }
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  if (params.get("relink") === "1" || params.get("pick") === "1") {
    return false;
  }
  if (options.sqliteFileMode && !options.hasStoredSqliteHandle) {
    return false;
  }
  return true;
}
