/**
 * Shared stylesheet for the printable HTML documents this app generates
 * (production report, salary sheet).
 *
 * Kept as a plain string of flat CSS on purpose: the printed document is
 * handed to a system browser / native printer that may be as old as
 * Chrome 109, so no CSS nesting, no `color-mix()`, no `oklch()`.
 */

export interface PrintStyleOptions {
  /** Font size of the data table, in px. Defaults to 11. */
  tableFontSize?: number;
  /** Padding inside table cells. Defaults to "4px 6px". */
  cellPadding?: string;
}

export function buildPrintStyles({
  tableFontSize = 11,
  cellPadding = "4px 6px",
}: PrintStyleOptions = {}): string {
  return (
    "body{margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#0a0a0a;background:#fff;padding:16px}" +
    ".mb-4{margin-bottom:12px}.mb-6{margin-bottom:20px}" +
    ".text-2xl{font-size:1.5rem;font-weight:700}.text-lg{font-size:1.125rem}.text-sm{font-size:0.75rem}" +
    ".text-gray-600{color:#52525b}" +
    ".border{border:1px solid #e4e4e7}.w-full{width:100%}" +
    `.table{width:100%;font-size:${tableFontSize}px;border-collapse:collapse}` +
    `.table th,.table td{padding:${cellPadding};text-align:left;border:1px solid #e4e4e7}` +
    ".table th{background:#f4f4f5;font-weight:600}" +
    ".text-right{text-align:right}" +
    ".no-print{display:none!important}"
  );
}
