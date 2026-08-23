/**
 * The salary sheet's column definition and its printable HTML.
 *
 * The column list lives here rather than in the page so the on-screen table
 * and the printed table cannot drift apart: both read `SALARY_SHEET_COLUMNS`,
 * and the printed totals row spans `SALARY_SHEET_COLUMNS.length` cells. A
 * column added here shows up in the header, the body and the print at once.
 *
 * Production workers are not in these rows — they are paid per piece and get
 * their own record from `productionPaySheet.ts` — so nothing here reads or
 * reserves a column for them.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import type { ProductionPaySheet } from "@/lib/services/productionPaySheetService";
import { currency, number } from "@/lib/utils/formatter";
import { buildPrintDocument, escapeHtml } from "./html";
import { buildPrintStyles } from "./styles";
import { buildProductionPaySheetBodyHtml } from "./productionPaySheet";

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export interface SalarySheetColumn {
  key: string;
  labelKey: MessageKey;
  align: "left" | "right";
  format: (row: SalarySheetRow) => string;
  /** The employee-name column also carries the "changed by hand" note. */
  isName?: boolean;
  muted?: boolean;
  emphasis?: boolean;
  nowrap?: boolean;
}

export const SALARY_SHEET_COLUMNS: SalarySheetColumn[] = [
  { key: "name", labelKey: "colEmployee", align: "left", format: (r) => r.name, isName: true },
  { key: "presentDays", labelKey: "calTitlePresent", align: "right", format: (r) => number(r.presentDays) },
  { key: "absentDays", labelKey: "calTitleAbsent", align: "right", format: (r) => number(r.absentDays) },
  { key: "holidayPresentDays", labelKey: "salarySheetColHolidayPresent", align: "right", nowrap: true, format: (r) => number(r.holidayPresentDays) },
  { key: "earnedSundayPayDays", labelKey: "salarySheetColEarnedSun", align: "right", nowrap: true, format: (r) => number(r.earnedSundayPayDays) },
  { key: "sundayPresentBonusDays", labelKey: "salarySheetColSunPlus", align: "right", nowrap: true, format: (r) => number(r.sundayPresentBonusDays) },
  { key: "totalPaidDays", labelKey: "salarySheetColPaidDays", align: "right", nowrap: true, format: (r) => number(r.totalPaidDays) },
  { key: "monthlySalary", labelKey: "salarySheetColMonthly", align: "right", nowrap: true, muted: true, format: (r) => currency(r.monthlySalary) },
  { key: "ratePerDay", labelKey: "salarySheetColPerDay", align: "right", nowrap: true, muted: true, format: (r) => currency(r.ratePerDay) },
  { key: "ratePerHour", labelKey: "salarySheetColPerHr", align: "right", nowrap: true, muted: true, format: (r) => currency(r.ratePerHour) },
  { key: "hoursExtraTotal", labelKey: "salarySheetColPlusHrs", align: "right", nowrap: true, format: (r) => number(r.hoursExtraTotal) },
  { key: "hoursReducedTotal", labelKey: "salarySheetColMinusHrs", align: "right", nowrap: true, format: (r) => number(r.hoursReducedTotal) },
  { key: "calculatedSalary", labelKey: "salarySheetColSalary", align: "right", nowrap: true, emphasis: true, format: (r) => currency(r.calculatedSalary) },
];

/** The attendance salary-sheet table, as printable HTML. */
export function buildSalaryTableHtml(
  rows: SalarySheetRow[],
  tr: Translate,
): string {
  const colCount = SALARY_SHEET_COLUMNS.length;
  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="${colCount}" class="border" style="padding:12px;color:#71717a;text-align:center">${escapeHtml(tr("salarySheetPrintEmpty"))}</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${SALARY_SHEET_COLUMNS.map((col) => {
                const cls = [
                  "border",
                  col.align === "right" ? "text-right" : "",
                  col.emphasis ? "font-semibold" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return `<td class="${cls}" style="padding:5px 6px">${escapeHtml(col.format(r))}</td>`;
              }).join("")}</tr>`,
          )
          .join("");

  const totalSalary = rows.reduce((sum, r) => sum + r.calculatedSalary, 0);
  // Label cell + filler + total cell must add up to exactly `colCount`.
  const totalRow =
    rows.length > 0
      ? `<tr class="border-t-2" style="border-top:2px solid #0a0a0a">` +
        `<td class="border font-semibold" style="padding:8px">${escapeHtml(tr("salarySheetPrintTotal"))}</td>` +
        `<td class="border text-right" colspan="${colCount - 2}" style="padding:8px"></td>` +
        `<td class="border text-right font-bold" style="padding:8px">${escapeHtml(currency(totalSalary))}</td>` +
        `</tr>`
      : "";

  const head = `<tr class="border">${SALARY_SHEET_COLUMNS.map(
    (col) =>
      `<th class="border${col.align === "right" ? " text-right" : ""}" style="padding:5px 6px">${escapeHtml(tr(col.labelKey))}</th>`,
  ).join("")}</tr>`;

  return `<table class="table w-full mb-6"><thead>${head}</thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;
}

/**
 * Compose the printed document. Which sections it carries follows the tab the
 * owner is looking at: the attendance salary sheet, the production work
 * record, or — on "All" — both, so one print run covers every worker.
 */
export function buildPrintableHtml({
  rows,
  productionSheet,
  monthLabel,
  from,
  to,
  tr,
}: {
  rows: SalarySheetRow[] | null;
  productionSheet: ProductionPaySheet | null;
  monthLabel: string;
  from: string;
  to: string;
  tr: Translate;
}): string {
  const sections: string[] = [];
  if (rows) sections.push(buildSalaryTableHtml(rows, tr));
  if (productionSheet)
    sections.push(buildProductionPaySheetBodyHtml(productionSheet, tr));

  const subtitle = rows
    ? `${tr("navSalarySheet")} – ${monthLabel}`
    : `${tr("prepTitle")} – ${monthLabel}`;

  return buildPrintDocument({
    title: subtitle,
    appName: tr("appName"),
    subtitle,
    meta: [
      { label: tr("salarySheetPrintMonth"), value: monthLabel },
      { label: tr("salarySheetPrintPeriod"), value: `${from} – ${to}` },
    ],
    body: sections.join(""),
    styles: buildPrintStyles({ tableFontSize: 10, cellPadding: "5px 6px" }),
  });
}
