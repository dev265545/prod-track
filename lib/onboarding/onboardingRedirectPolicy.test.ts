import { describe, expect, it } from "vitest";
import { shouldRedirectCompletedUserFromOnboarding } from "./onboardingRedirectPolicy";

describe("shouldRedirectCompletedUserFromOnboarding (sqlite-file relink)", () => {
  const sqlite = { sqliteFileMode: true, hasStoredSqliteHandle: true };
  const sqliteNoHandle = { sqliteFileMode: true, hasStoredSqliteHandle: false };
  const idb = { sqliteFileMode: false, hasStoredSqliteHandle: false };

  it("does not redirect when relink=1 (user chose another database file)", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding(
        "/onboarding",
        "?relink=1",
        sqlite,
      ),
    ).toBe(false);
  });

  it("does not redirect when pick=1", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding(
        "/onboarding",
        "?pick=1",
        sqlite,
      ),
    ).toBe(false);
  });

  it("does not redirect in sqlite-file mode when no handle is stored (must stay to pick a .db)", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding(
        "/onboarding",
        "",
        sqliteNoHandle,
      ),
    ).toBe(false);
  });

  it("redirects in sqlite-file mode when a handle exists and no relink query", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding("/onboarding", "", sqlite),
    ).toBe(true);
  });

  it("redirects in non–sqlite-file mode from /onboarding (indexeddb path)", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding("/onboarding", "", idb),
    ).toBe(true);
  });

  it("never redirects when pathname is not onboarding", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding("/login", "", sqlite),
    ).toBe(false);
  });

  it("relink wins even if other params are present", () => {
    expect(
      shouldRedirectCompletedUserFromOnboarding(
        "/onboarding",
        "?x=1&relink=1&y=2",
        sqlite,
      ),
    ).toBe(false);
  });
});
