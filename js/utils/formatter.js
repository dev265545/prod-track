/**
 * ProdTrack Lite - Formatting helpers
 */

const CURRENCY = '₹';
const LOCALE = 'en-IN';

export function currency(value) {
  if (value == null || Number.isNaN(Number(value))) return `${CURRENCY} 0`;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

export function number(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  return new Intl.NumberFormat(LOCALE).format(Number(n));
}

export function dateDisplay(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}
