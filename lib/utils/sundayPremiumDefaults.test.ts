import { describe, expect, it } from "vitest";
import {
  SUNDAY_PREMIUM_BOUNDS,
  SUNDAY_PREMIUM_EXAMPLE_DAY_RATE,
  clampSundayPremiumDefaults,
  sundayPremiumExample,
} from "./sundayPremiumDefaults";

const BASE = { requiredPresentDays: 26, multiplier: 1.2 };

describe("clampSundayPremiumDefaults", () => {
  it("keeps values already in range", () => {
    expect(clampSundayPremiumDefaults({ requiredPresentDays: 20, multiplier: 1.5 }, BASE)).toEqual(
      { requiredPresentDays: 20, multiplier: 1.5 },
    );
  });

  it("never produces a multiplier below 1, which would cut pay", () => {
    expect(
      clampSundayPremiumDefaults({ requiredPresentDays: 26, multiplier: 0.5 }, BASE).multiplier,
    ).toBe(SUNDAY_PREMIUM_BOUNDS.minMultiplier);
  });

  it("caps required days at the longest month and multiplier at its maximum", () => {
    const out = clampSundayPremiumDefaults(
      { requiredPresentDays: 99, multiplier: 50 },
      BASE,
    );
    expect(out.requiredPresentDays).toBe(SUNDAY_PREMIUM_BOUNDS.maxDays);
    expect(out.multiplier).toBe(SUNDAY_PREMIUM_BOUNDS.maxMultiplier);
  });

  it("falls back rather than yielding NaN for unusable entries", () => {
    expect(clampSundayPremiumDefaults({}, BASE)).toEqual(BASE);
    expect(
      clampSundayPremiumDefaults(
        { requiredPresentDays: "abc", multiplier: Number.NaN },
        BASE,
      ),
    ).toEqual(BASE);
  });

  it("rounds days to whole days and multipliers to two places", () => {
    const out = clampSundayPremiumDefaults(
      { requiredPresentDays: 25.6, multiplier: 1.23456 },
      BASE,
    );
    expect(out.requiredPresentDays).toBe(26);
    expect(out.multiplier).toBe(1.23);
  });

  it("clamps negative days to zero", () => {
    expect(
      clampSundayPremiumDefaults({ requiredPresentDays: -5, multiplier: 2 }, BASE)
        .requiredPresentDays,
    ).toBe(0);
  });
});

describe("sundayPremiumExample", () => {
  it("describes the ordinary case with the money it works out to", () => {
    expect(sundayPremiumExample({ requiredPresentDays: 26, multiplier: 1.2 })).toEqual({
      key: "setgPayExamplePays",
      vars: {
        days: 26,
        times: 1.2,
        rate: SUNDAY_PREMIUM_EXAMPLE_DAY_RATE,
        amount: 600,
      },
    });
  });

  it("says plainly that 1x pays no extra at all", () => {
    expect(sundayPremiumExample({ requiredPresentDays: 26, multiplier: 1 }).key).toBe(
      "setgPayExampleFlat",
    );
  });

  it("says that 0 required days means every Sunday qualifies", () => {
    const example = sundayPremiumExample({ requiredPresentDays: 0, multiplier: 2 });
    expect(example.key).toBe("setgPayExampleEvery");
    expect(example.vars.amount).toBe(1000);
  });

  it("uses clamped values so the sentence can never advertise a pay cut", () => {
    const example = sundayPremiumExample({ requiredPresentDays: 26, multiplier: 0.5 });
    expect(example.vars.times).toBe(1);
    expect(example.key).toBe("setgPayExampleFlat");
  });
});
