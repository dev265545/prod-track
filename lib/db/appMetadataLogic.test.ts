import { describe, it, expect } from "vitest";
import {
  shouldRouteToLoginAfterDbOpen,
  type AppDbRecord,
} from "./appMetadataLogic";

describe("shouldRouteToLoginAfterDbOpen", () => {
  it("returns false for empty new workspace", () => {
    expect(shouldRouteToLoginAfterDbOpen(null, false)).toBe(false);
  });

  it("returns true when onboarding flag is set in DB", () => {
    const meta: AppDbRecord = {
      id: "_app",
      onboardingComplete: true,
      passwordHash: "abc",
    };
    expect(shouldRouteToLoginAfterDbOpen(meta, false)).toBe(true);
  });

  it("returns true for legacy DB with data but no _app row", () => {
    expect(shouldRouteToLoginAfterDbOpen(null, true)).toBe(true);
  });

  it("returns false when _app exists but onboarding not finished", () => {
    const meta: AppDbRecord = {
      id: "_app",
      onboardingComplete: false,
      passwordHash: null,
    };
    expect(shouldRouteToLoginAfterDbOpen(meta, true)).toBe(false);
  });
});
