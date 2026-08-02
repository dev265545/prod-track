/**
 * The factory-wide fallback for Sunday extra pay.
 *
 * These two numbers are the *last* link of the chain read by
 * `resolveOperatorSundayRule`: the worker's own field wins, then the Sunday
 * category's own premium, and only if both are absent are these used. The
 * editor has to say that out loud, so the rules live here in one testable
 * place rather than being re-guessed in the component.
 *
 * Bounds are deliberately narrower than storage accepts. `appSettingsService`
 * keeps a multiplier anywhere in 0..10, but a multiplier below 1 would quietly
 * *cut* Sunday pay while being labelled a premium, so the editor refuses to
 * produce one. Days are capped at 31 because they count present days inside a
 * single month, and a requirement no month can meet would silently disable the
 * premium for everybody.
 */

export interface SundayPremiumDefaults {
  requiredPresentDays: number;
  multiplier: number;
}

export const SUNDAY_PREMIUM_BOUNDS = {
  minDays: 0,
  maxDays: 31,
  minMultiplier: 1,
  maxMultiplier: 10,
} as const;

/** The day's pay used by the worked example. A round number reads instantly. */
export const SUNDAY_PREMIUM_EXAMPLE_DAY_RATE = 500;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Force any pair of entries into the range the editor is willing to save.
 * NaN and missing values fall back to the caller's current values.
 */
export function clampSundayPremiumDefaults(
  raw: Partial<Record<keyof SundayPremiumDefaults, unknown>>,
  fallback: SundayPremiumDefaults,
): SundayPremiumDefaults {
  return {
    requiredPresentDays: Math.round(
      clampNumber(
        raw.requiredPresentDays,
        SUNDAY_PREMIUM_BOUNDS.minDays,
        SUNDAY_PREMIUM_BOUNDS.maxDays,
        fallback.requiredPresentDays,
      ),
    ),
    multiplier: round2(
      clampNumber(
        raw.multiplier,
        SUNDAY_PREMIUM_BOUNDS.minMultiplier,
        SUNDAY_PREMIUM_BOUNDS.maxMultiplier,
        fallback.multiplier,
      ),
    ),
  };
}

export interface SundayPremiumExample {
  /** Message key describing the sentence to render. */
  key: "setgPayExampleFlat" | "setgPayExampleEvery" | "setgPayExamplePays";
  vars: { days: number; times: number; rate: number; amount: number };
}

/**
 * The live worked example. Three genuinely different sentences, because
 * "1×" and "0 days required" are not edge cases to the owner — they are the
 * two settings most likely to be typed by mistake, and each means something
 * quite different from the ordinary case.
 */
export function sundayPremiumExample(
  values: SundayPremiumDefaults,
): SundayPremiumExample {
  const safe = clampSundayPremiumDefaults(values, {
    requiredPresentDays: 26,
    multiplier: 1.2,
  });
  const vars = {
    days: safe.requiredPresentDays,
    times: safe.multiplier,
    rate: SUNDAY_PREMIUM_EXAMPLE_DAY_RATE,
    amount: round2(SUNDAY_PREMIUM_EXAMPLE_DAY_RATE * safe.multiplier),
  };
  if (safe.multiplier === 1) return { key: "setgPayExampleFlat", vars };
  if (safe.requiredPresentDays === 0) return { key: "setgPayExampleEvery", vars };
  return { key: "setgPayExamplePays", vars };
}
