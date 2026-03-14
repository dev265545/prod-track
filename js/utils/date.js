/**
 * ProdTrack Lite - Date & pay-period utilities
 * Each month has two 15-day periods: 1st–15th and 16th–last day of month.
 */

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format YYYY-MM-DD for input[type="date"] and storage.
 * @param {Date} d
 * @returns {string}
 */
export function toISODate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${y}-${m}-${day}`;
}

/**
 * Today in YYYY-MM-DD.
 */
export function today() {
  return toISODate(new Date());
}

/**
 * Last day of month (1–31).
 * @param {number} year
 * @param {number} month - 0-indexed (0 = Jan)
 */
function getLastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the pay period that contains the given date.
 * Period is either 1st–15th of the month or 16th–last day of the same month.
 * @param {string|Date} date - YYYY-MM-DD or Date
 * @returns {{ from: string, to: string, label: string, year: number, month: number }}
 */
export function getPeriodForDate(date) {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();

  let from;
  let to;
  let label;

  if (day <= 15) {
    // First half of month: 1st – 15th
    from = `${y}-${pad(m + 1)}-01`;
    to = `${y}-${pad(m + 1)}-15`;
    label = `1–15 ${monthNames[m]} ${y}`;
  } else {
    // Second half: 16th – last day of month
    const lastDay = getLastDayOfMonth(y, m);
    from = `${y}-${pad(m + 1)}-16`;
    to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    label = `16–${lastDay} ${monthNames[m]} ${y}`;
  }

  return { from, to, label, year: y, month: m };
}

/**
 * List of periods from oldest to newest. Each month has two periods (1–15 and 16–end).
 * @param {number} count - max number of periods (default 24 = 12 months × 2)
 * @returns {Array<{ from: string, to: string, label: string }>}
 */
export function getPeriods(count = 24) {
  const now = new Date();
  const periods = [];
  const monthsBack = Math.ceil(count / 2);
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const lastDay = getLastDayOfMonth(y, m);
    periods.push({
      from: `${y}-${pad(m + 1)}-01`,
      to: `${y}-${pad(m + 1)}-15`,
      label: `1–15 ${monthNames[m]} ${y}`,
    });
    periods.push({
      from: `${y}-${pad(m + 1)}-16`,
      to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
      label: `16–${lastDay} ${monthNames[m]} ${y}`,
    });
  }
  return periods.slice(-count);
}

/**
 * Check if a date string is within a period.
 * @param {string} date - YYYY-MM-DD
 * @param {string} from
 * @param {string} to
 */
export function isDateInPeriod(date, from, to) {
  return date >= from && date <= to;
}

/**
 * From a list of records with .date, return only periods that have at least one record.
 * @param {Array<{ date: string }>} records - e.g. productions or advances
 * @param {number} maxPeriods
 * @returns {Array<{ from: string, to: string, label: string }>}
 */
export function getPeriodsWithData(records, maxPeriods = 24) {
  const keysWithData = new Set();
  records.forEach((r) => {
    if (r.date) {
      const p = getPeriodForDate(r.date);
      keysWithData.add(`${p.from}|${p.to}`);
    }
  });
  const all = getPeriods(maxPeriods);
  return all.filter((p) => keysWithData.has(`${p.from}|${p.to}`));
}
