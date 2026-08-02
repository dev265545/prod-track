import { describe, expect, it, vi } from "vitest";

// The resolvers under test are pure, but the module they live in reaches for
// the database and the audit log at import time. Stub both so this file tests
// the rule resolution and nothing else.
vi.mock("@/lib/db/adapter", () => ({
  STORES: { SUNDAY_CATEGORIES: "sunday_categories" },
  getAll: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./auditService", () => ({
  AUDIT_ACTIONS: {
    sundayCategoryCreate: "a",
    sundayCategoryUpdate: "b",
    sundayCategoryDelete: "c",
  },
  diffEntity: () => null,
  record: vi.fn(),
}));

import {
  resolveSundayCategoryRule,
  resolveUnassignedSundayRule,
  type SundayCategory,
} from "./sundayCategoryService";
import { DEFAULT_SUNDAY_RULE, normalizeSundayRule } from "@/lib/utils/sundayRule";
import { evaluateSundayRuleForCycle } from "@/lib/utils/sundayRule";

const halfDayRule = normalizeSundayRule({
  kind: "table",
  brackets: [{ whenPresentDaysAtLeast: 10, give: 0.5 }],
  maxPerCycle: null,
  maxPerMonth: null,
});

const categories: SundayCategory[] = [
  { id: "cat_helpers", name: "Helpers", rule: halfDayRule },
  { id: "cat_fitters", name: "Fitters" },
];

describe("a worker with no Sunday rule of their own", () => {
  it("is paid exactly as before when nothing has been chosen", () => {
    // The whole point of the default: an install that never opens this screen
    // must not move by a rupee.
    const resolved = resolveUnassignedSundayRule(
      { noCategorySundayRule: "asBefore", noCategorySundayCategoryId: "" },
      categories,
    );
    expect(resolved.source).toBe("asBefore");
    expect(resolved.rule).toEqual(DEFAULT_SUNDAY_RULE);
    expect(evaluateSundayRuleForCycle(resolved.rule, 12).earned).toBe(2);
  });

  it("earns no extra days when the owner says so", () => {
    const resolved = resolveUnassignedSundayRule(
      { noCategorySundayRule: "nothing", noCategorySundayCategoryId: "" },
      categories,
    );
    expect(resolved.source).toBe("nothing");
    // Nothing earned at any attendance level, including a perfect month.
    for (let days = 0; days <= 31; days += 1) {
      expect(evaluateSundayRuleForCycle(resolved.rule, days).earned).toBe(0);
    }
    // A Sunday actually worked is still a day's pay: "earns no extra days" is
    // about the earning schedule, not about refusing to pay for work done.
    expect(resolved.rule.sundayWorkedPayDays).toBe(1);
  });

  it("follows a named rule of the owner's own", () => {
    const resolved = resolveUnassignedSundayRule(
      {
        noCategorySundayRule: "category",
        noCategorySundayCategoryId: "cat_helpers",
      },
      categories,
    );
    expect(resolved.source).toBe("category");
    expect(resolved.categoryName).toBe("Helpers");
    expect(evaluateSundayRuleForCycle(resolved.rule, 12).earned).toBe(0.5);
  });

  it("says what really happens when the named rule has been deleted", () => {
    // Reporting "category" here would let the People screen name a rule that
    // no longer exists while the engine quietly pays a different one.
    const resolved = resolveUnassignedSundayRule(
      { noCategorySundayRule: "category", noCategorySundayCategoryId: "gone" },
      categories,
    );
    expect(resolved.source).toBe("asBefore");
    expect(resolved.rule).toEqual(DEFAULT_SUNDAY_RULE);
  });
});

describe("resolveSundayCategoryRule", () => {
  it("still answers with the built-in rule when no fallback is passed", () => {
    expect(resolveSundayCategoryRule(undefined)).toEqual(DEFAULT_SUNDAY_RULE);
    expect(resolveSundayCategoryRule(null)).toEqual(DEFAULT_SUNDAY_RULE);
  });

  it("uses the given fallback only for a worker with no category", () => {
    expect(resolveSundayCategoryRule(undefined, halfDayRule)).toEqual(halfDayRule);
    // A worker who does have a category is unaffected by the fallback.
    expect(resolveSundayCategoryRule(categories[0], DEFAULT_SUNDAY_RULE)).toEqual(
      halfDayRule,
    );
  });

  it("still migrates a legacy row on read", () => {
    const rule = resolveSundayCategoryRule(
      { mode: "step", everyPresentDays: 6, earnedPerStep: 1 },
      halfDayRule,
    );
    expect(rule.kind).toBe("repeat");
    expect(rule.repeatEveryPresentDays).toBe(6);
  });
});
