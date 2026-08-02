/**
 * Small helpers shared by the printable HTML documents this app generates.
 *
 * Everything here emits plain, flat HTML/CSS: the document is handed to a
 * system browser or a native printer that may be as old as Chrome 109.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface PrintDocumentOptions {
  /** Browser/tab title of the printed document. */
  title: string;
  /** Big heading, top-left (the app name). */
  appName: string;
  /** Line under the heading. */
  subtitle: string;
  /** Label/value pairs printed top-right (month, period, …). */
  meta: { label: string; value: string }[];
  /** Already-escaped body HTML. */
  body: string;
  /** Stylesheet from `buildPrintStyles`. */
  styles: string;
}

/** Wrap page content in the standard printed-document shell. */
export function buildPrintDocument({
  title,
  appName,
  subtitle,
  meta,
  body,
  styles,
}: PrintDocumentOptions): string {
  const metaHtml = meta
    .map(
      (m) =>
        `<p><strong>${escapeHtml(m.label)}</strong> ${escapeHtml(m.value)}</p>`,
    )
    .join("");
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>${styles}</style></head>` +
    `<body id="printArea"><div style="max-width:100%;margin:0 auto">` +
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">` +
    `<div><h1 class="text-2xl">${escapeHtml(appName)}</h1>` +
    `<p class="text-sm text-gray-600">${escapeHtml(subtitle)}</p></div>` +
    `<div class="text-sm text-right">${metaHtml}</div></div>` +
    `${body}</div></body></html>`
  );
}
