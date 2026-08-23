/**
 * The cumulative production report, as printable HTML.
 *
 * Lives here rather than in the reports page so it shares the one document
 * shell (`buildPrintDocument`) and the one stylesheet (`buildPrintStyles`)
 * with every other printed page, and so its escaping is testable without a
 * browser: item names come from user input and must never reach the document
 * raw.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import { number } from "@/lib/utils/formatter";
import { buildPrintDocument, escapeHtml } from "./html";
import { buildPrintStyles } from "./styles";

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export type ProductionReportScope = "day" | "night" | "both";

export interface ProductionReportRow {
  itemId: string;
  itemName: string;
  dayQty: number;
  nightQty: number;
  qty: number;
}

function th(label: string, right = false): string {
  return `<th class="border${right ? " text-right" : ""}" style="padding:6px">${escapeHtml(label)}</th>`;
}

function td(value: string, right = false): string {
  return `<td class="border${right ? " text-right" : ""}" style="padding:4px 6px">${escapeHtml(value)}</td>`;
}

/** Which quantity columns the chosen scope prints, in order. */
function quantityColumns(
  scope: ProductionReportScope,
  tr: Translate,
): { label: string; value: (row: ProductionReportRow) => number }[] {
  if (scope === "day") return [{ label: tr("colDay"), value: (r) => r.dayQty }];
  if (scope === "night")
    return [{ label: tr("colNight"), value: (r) => r.nightQty }];
  return [
    { label: tr("colDay"), value: (r) => r.dayQty },
    { label: tr("colNight"), value: (r) => r.nightQty },
    { label: tr("colTotal"), value: (r) => r.qty },
  ];
}

export function buildProductionReportHtml({
  rows,
  scope,
  periodLabel,
  tr,
  lang,
}: {
  rows: ProductionReportRow[];
  scope: ProductionReportScope;
  periodLabel: string;
  tr: Translate;
  lang?: string;
}): string {
  const quantities = quantityColumns(scope, tr);
  const colCount = quantities.length + 1;

  const head =
    `<tr class="border">` +
    th(tr("reportsColPackagingGroup")) +
    quantities.map((q) => th(q.label, true)).join("") +
    `</tr>`;

  const body =
    rows.length === 0
      ? `<tr><td colspan="${colCount}" class="border" style="padding:6px;color:#71717a">${escapeHtml(tr("reportsNoProductionInPeriod"))}</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>` +
              td(r.itemName) +
              quantities.map((q) => td(number(q.value(r)), true)).join("") +
              `</tr>`,
          )
          .join("");

  const filterLabel =
    scope === "day"
      ? tr("reportsPrintFilterDayOnly")
      : scope === "night"
        ? tr("reportsPrintFilterNightOnly")
        : "";
  const cumulativeDesc =
    scope === "day"
      ? tr("reportsPrintCumulativeDescDay")
      : scope === "night"
        ? tr("reportsPrintCumulativeDescNight")
        : tr("reportsPrintCumulativeDescBoth");

  const body_ =
    `<h2 class="text-lg" style="font-weight:600;margin-bottom:6px">${escapeHtml(tr("reportsPrintCumulativeHeading"))}</h2>` +
    `<p class="text-sm text-gray-600 mb-4">${escapeHtml(cumulativeDesc)}</p>` +
    `<table class="table w-full mb-6"><thead>${head}</thead><tbody>${body}</tbody></table>`;

  return buildPrintDocument({
    title: `${tr("reportsPrintTitleSuffix")} – ${periodLabel}`,
    appName: tr("appName"),
    subtitle: `${tr("reportsPrintTitleSuffix")}${filterLabel}`,
    meta: [{ label: tr("reportsPrintPeriodLabel"), value: periodLabel }],
    body: body_,
    styles: buildPrintStyles(),
    lang,
  });
}
