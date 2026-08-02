/**
 * ProdTrack Lite - Formatting helpers
 */

const CURRENCY = "₹";
const LOCALE = "en-IN";

/**
 * `Intl.NumberFormat` is expensive to construct and cheap to reuse: building
 * one per call cost 109.6ms over 1,950 calls against 1.8ms cached, and every
 * table in the app formats a cell per row on a low-end Chrome 109 machine.
 *
 * There is exactly one locale to cache for. `LOCALE` is a compile-time constant
 * — the en/hi language switch (`lib/i18n/`) picks the *words*, never the number
 * shape, so money and counts stay in Indian lakh/crore grouping in both
 * languages. If a runtime locale is ever introduced here these caches must be
 * keyed on it, or the first locale used would freeze in for the session.
 */
const RUPEES_WHOLE = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
const RUPEES_PAISE = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const PLAIN_NUMBER = new Intl.NumberFormat(LOCALE);

/**
 * Rupees, showing paise only when there are any.
 *
 * Money is computed and stored rounded to two decimals (`round2`, the
 * salary-sheet engine's convention). Printing it with no decimals at all made
 * the stored number and the printed number two different values — ₹0.30 of
 * piece-rate work appeared as ₹0 on the payslip. Whole amounts, which is
 * nearly everything, still print as `₹15,000` with no trailing `.00`.
 */
export function currency(value: unknown): string {
  if (value == null || Number.isNaN(Number(value))) return `${CURRENCY} 0`;
  const amount = Number(value);
  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  return (hasPaise ? RUPEES_PAISE : RUPEES_WHOLE).format(amount);
}

export function number(n: unknown): string {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return PLAIN_NUMBER.format(Number(n));
}

export function dateDisplay(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
