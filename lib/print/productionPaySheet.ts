import type { ProductionPaySheet } from "@/lib/services/productionPaySheetService";
import type { MessageKey } from "@/lib/i18n/messages";
import { currency, number } from "@/lib/utils/formatter";
import { escapeHtml } from "./html";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const CELL = 'style="padding:5px 6px"';

function th(label: string, right = false): string {
  return `<th class="border${right ? " text-right" : ""}" ${CELL}>${escapeHtml(label)}</th>`;
}

function td(value: string, right = false, bold = false): string {
  const cls = ["border", right ? "text-right" : ""].filter(Boolean).join(" ");
  const style = bold ? 'style="padding:5px 6px;font-weight:700"' : CELL;
  return `<td class="${cls}" ${style}>${escapeHtml(value)}</td>`;
}

function heading(text: string): string {
  return `<h2 class="text-lg" style="font-weight:600;margin:0 0 6px">${escapeHtml(text)}</h2>`;
}

function emptyRow(colspan: number, text: string): string {
  return `<tr><td colspan="${colspan}" class="border" style="padding:12px;color:#71717a;text-align:center">${escapeHtml(text)}</td></tr>`;
}

/**
 * The "money to give" table: one line per production worker, with the day /
 * night split, the money their work is worth, the advance to cut, and what is
 * left to hand over. This is the table the owner pays from.
 */
function buildPayTable(sheet: ProductionPaySheet, tr: Translate): string {
  const head =
    `<tr class="border">` +
    th(tr("colEmployee")) +
    th(tr("prepColDayShift"), true) +
    th(tr("prepColNightShift"), true) +
    th(tr("prepColTotalMade"), true) +
    th(tr("prepColWorkMoney"), true) +
    th(tr("prepColAdvanceTaken"), true) +
    th(tr("prepColAdvanceToCut"), true) +
    th(tr("prepColAmountToPay"), true) +
    `</tr>`;

  const body =
    sheet.rows.length === 0
      ? emptyRow(8, tr("prepEmptyTitle"))
      : sheet.rows
          .map(
            (r) =>
              `<tr>` +
              td(r.name) +
              td(number(r.dayQuantity), true) +
              td(number(r.nightQuantity), true) +
              td(number(r.totalQuantity), true) +
              td(currency(r.workAmount), true) +
              td(currency(r.advanceTaken), true) +
              td(currency(r.advanceDeduction), true) +
              td(currency(r.amountToPay), true, true) +
              `</tr>`,
          )
          .join("");

  const totals =
    sheet.rows.length === 0
      ? ""
      : `<tr style="border-top:2px solid #0a0a0a">` +
        td(tr("salarySheetPrintTotal"), false, true) +
        td(number(sheet.totals.dayQuantity), true, true) +
        td(number(sheet.totals.nightQuantity), true, true) +
        td(number(sheet.totals.totalQuantity), true, true) +
        td(currency(sheet.totals.workAmount), true, true) +
        td(currency(sheet.totals.advanceTaken), true, true) +
        td(currency(sheet.totals.advanceDeduction), true, true) +
        td(currency(sheet.totals.amountToPay), true, true) +
        `</tr>`;

  return (
    heading(tr("prepPayHeading")) +
    `<table class="table w-full mb-6"><thead>${head}</thead><tbody>${body}${totals}</tbody></table>`
  );
}

/** The backing detail: which items each worker made, by day and night shift. */
function buildMadeTable(sheet: ProductionPaySheet, tr: Translate): string {
  const head =
    `<tr class="border">` +
    th(tr("colEmployee")) +
    th(tr("prepColItem")) +
    th(tr("prepColDayShift"), true) +
    th(tr("prepColNightShift"), true) +
    th(tr("prepColTotalMade"), true) +
    th(tr("prepColRateForOne"), true) +
    th(tr("prepColWorkMoney"), true) +
    `</tr>`;

  const lines = sheet.rows
    .map((r) =>
      r.items.length === 0
        ? `<tr>${td(r.name)}<td colspan="6" class="border" style="padding:5px 6px;color:#71717a">${escapeHtml(tr("prepNoWork"))}</td></tr>`
        : r.items
            .map(
              (item, index) =>
                `<tr>` +
                td(index === 0 ? r.name : "") +
                td(item.itemName) +
                td(number(item.dayQuantity), true) +
                td(number(item.nightQuantity), true) +
                td(number(item.totalQuantity), true) +
                td(currency(item.rate), true) +
                td(currency(item.amount), true) +
                `</tr>`,
            )
            .join(""),
    )
    .join("");

  const body = lines || emptyRow(7, tr("prepNoWorkAtAll"));

  return (
    heading(tr("prepMadeHeading")) +
    `<table class="table w-full mb-6"><thead>${head}</thead><tbody>${body}</tbody></table>`
  );
}

/**
 * Body HTML for the production work record — both tables. Wrap it with
 * `buildPrintDocument` (on its own, or below the salary sheet table).
 */
export function buildProductionPaySheetBodyHtml(
  sheet: ProductionPaySheet,
  tr: Translate,
): string {
  return buildPayTable(sheet, tr) + buildMadeTable(sheet, tr);
}
