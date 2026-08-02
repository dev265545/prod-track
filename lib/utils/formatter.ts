/**
 * ProdTrack Lite - Formatting helpers
 */

const CURRENCY = "₹";
const LOCALE = "en-IN";

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
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: hasPaise ? 2 : 0,
    minimumFractionDigits: hasPaise ? 2 : 0,
  }).format(amount);
}

export function number(n: unknown): string {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return new Intl.NumberFormat(LOCALE).format(Number(n));
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
