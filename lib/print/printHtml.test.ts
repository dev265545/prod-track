/**
 * Tests for every printable document this app builds.
 *
 * There is no PDF generator in this codebase: "PDF export" means the printed
 * HTML below is handed to a browser (or the Tauri printer plugin) and the user
 * picks "Save as PDF". So the HTML string IS the artefact, and it can be
 * asserted on with no browser at all — which is what happens here.
 *
 * What each test guards:
 *  - the table body has exactly as many cells as the header (a totals row that
 *    spans the wrong number of columns silently shifts every figure),
 *  - user-supplied text (employee and item names) is escaped,
 *  - no "undefined" / "NaN" / "[object Object]" leaks into the paper,
 *  - the shared stylesheet is present exactly once,
 *  - the CSS stays parseable by Chrome 109, which is as old as the browsers
 *    this ships to.
 */

import { describe, expect, it } from "vitest";
import type { MessageKey } from "@/lib/i18n/messages";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import type { ProductionPaySheet } from "@/lib/services/productionPaySheetService";
import { escapeHtml, buildPrintDocument } from "./html";
import { buildPrintStyles } from "./styles";
import {
  SALARY_SHEET_COLUMNS,
  buildSalaryTableHtml,
  buildPrintableHtml,
} from "./salarySheet";
import { buildProductionPaySheetBodyHtml } from "./productionPaySheet";
import { buildProductionReportHtml } from "./productionReport";

/** Identity translator: keys come back verbatim, so assertions stay stable. */
const tr = (key: MessageKey) => key as string;

const HOSTILE_NAME = '<script>alert("x")</script>';

function salaryRow(overrides: Partial<SalarySheetRow> = {}): SalarySheetRow {
  return {
    id: "e1",
    name: "Asha",
    employeeType: "salaried",
    presentDays: 24,
    absentDays: 2,
    holidayPresentDays: 1,
    earnedSundayPayDays: 2,
    sundayPresentBonusDays: 0.5,
    totalPaidDays: 27.5,
    monthlySalary: 15000,
    ratePerDay: 500,
    ratePerHour: 62.5,
    hoursExtraTotal: 4,
    hoursReducedTotal: 1,
    calculatedSalary: 13750,
    ...overrides,
  } as SalarySheetRow;
}

function paySheet(overrides: Partial<ProductionPaySheet> = {}): ProductionPaySheet {
  return {
    from: "2026-07-01",
    to: "2026-07-31",
    rows: [
      {
        id: "p1",
        name: "Ravi",
        dayQuantity: 100,
        nightQuantity: 50,
        totalQuantity: 150,
        workAmount: 1500,
        advanceTaken: 400,
        advanceDeduction: 200,
        amountToPay: 1300,
        items: [
          {
            itemId: "i1",
            itemName: "Cap 28mm",
            dayQuantity: 100,
            nightQuantity: 50,
            totalQuantity: 150,
            rate: 10,
            amount: 1500,
          },
        ],
      },
    ],
    totals: {
      dayQuantity: 100,
      nightQuantity: 50,
      totalQuantity: 150,
      workAmount: 1500,
      advanceTaken: 400,
      advanceDeduction: 200,
      amountToPay: 1300,
    },
    ...overrides,
  } as ProductionPaySheet;
}

/** Count the cells a `<tr>` occupies, honouring colspan. */
function cellSpan(rowHtml: string): number {
  const cells = rowHtml.match(/<t[dh]\b[^>]*>/g) ?? [];
  return cells.reduce((total, cell) => {
    const span = /colspan="(\d+)"/.exec(cell);
    return total + (span ? Number(span[1]) : 1);
  }, 0);
}

function rowsOf(tableHtml: string): string[] {
  return tableHtml.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
}

/** Every printed document must be free of these, whatever the data. */
function expectNoGarbage(html: string) {
  expect(html).not.toMatch(/undefined/);
  expect(html).not.toMatch(/NaN/);
  expect(html).not.toMatch(/\[object Object\]/);
}

/** Chrome 109 predates all of these; a print that uses them renders wrong. */
function expectChrome109SafeCss(css: string) {
  expect(css).not.toMatch(/color-mix\(/);
  expect(css).not.toMatch(/oklch\(/);
  expect(css).not.toMatch(/oklab\(/);
  expect(css).not.toMatch(/lch\(/);
  expect(css).not.toMatch(/\bcolor\(\s*display-p3/);
  // CSS nesting: a `&` outside a string is the giveaway.
  expect(css).not.toMatch(/&/);
}

describe("escapeHtml", () => {
  it("neutralises tags and quotes", () => {
    expect(escapeHtml(HOSTILE_NAME)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes the ampersand first, so entities are not double-decoded", () => {
    expect(escapeHtml("A & <b>")).toBe("A &amp; &lt;b&gt;");
  });
});

describe("buildPrintStyles", () => {
  it("is plain sRGB CSS a Chrome 109 print engine can parse", () => {
    expectChrome109SafeCss(buildPrintStyles());
    expectChrome109SafeCss(
      buildPrintStyles({ tableFontSize: 10, cellPadding: "5px 6px" }),
    );
  });

  it("honours the table font size and cell padding it is given", () => {
    const css = buildPrintStyles({ tableFontSize: 9, cellPadding: "2px 3px" });
    expect(css).toContain("font-size:9px");
    expect(css).toContain("padding:2px 3px");
  });
});

describe("buildPrintDocument", () => {
  it("embeds the stylesheet exactly once and escapes its own text", () => {
    const html = buildPrintDocument({
      title: HOSTILE_NAME,
      appName: HOSTILE_NAME,
      subtitle: HOSTILE_NAME,
      meta: [{ label: "Month", value: HOSTILE_NAME }],
      body: "<p>body</p>",
      styles: buildPrintStyles(),
    });
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).not.toContain("<script>");
    expect(html).toContain('lang="en"');
    expectNoGarbage(html);
  });

  it("carries the requested document language", () => {
    const html = buildPrintDocument({
      title: "t",
      appName: "a",
      subtitle: "s",
      meta: [],
      body: "",
      styles: "",
      lang: "hi",
    });
    expect(html).toContain('lang="hi"');
  });
});

describe("salary sheet print", () => {
  it("has 13 columns, and header, body and totals rows all agree", () => {
    const html = buildSalaryTableHtml([salaryRow(), salaryRow({ id: "e2" })], tr);
    const rows = rowsOf(html);
    expect(SALARY_SHEET_COLUMNS).toHaveLength(13);
    for (const row of rows) {
      expect(cellSpan(row)).toBe(SALARY_SHEET_COLUMNS.length);
    }
    // header + 2 data rows + totals
    expect(rows).toHaveLength(4);
  });

  it("prints the total of the salary column in the last cell", () => {
    const html = buildSalaryTableHtml(
      [
        salaryRow({ id: "a", calculatedSalary: 1000 }),
        salaryRow({ id: "b", calculatedSalary: 250.5 }),
      ],
      tr,
    );
    const totals = rowsOf(html).at(-1)!;
    expect(totals).toContain("salarySheetPrintTotal");
    // `currency` rounds to whole rupees for print.
    expect(totals).toContain("1,251");
  });

  it("escapes an employee named like a script tag", () => {
    const html = buildSalaryTableHtml([salaryRow({ name: HOSTILE_NAME })], tr);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("spans all 13 columns when there are no rows, and prints no totals", () => {
    const html = buildSalaryTableHtml([], tr);
    const rows = rowsOf(html);
    expect(rows).toHaveLength(2); // header + empty message
    expect(cellSpan(rows[1])).toBe(13);
    expect(html).not.toContain("salarySheetPrintTotal");
  });

  it("does not reserve a column for production workers, who are not in these rows", () => {
    // Production employees are excluded upstream by salarySheetService; the
    // printed table must not leave a hole where they used to be.
    const keys = SALARY_SHEET_COLUMNS.map((c) => c.key);
    expect(keys).not.toContain("production");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("production pay record print", () => {
  it("keeps the pay table square, totals row included", () => {
    const html = buildProductionPaySheetBodyHtml(paySheet(), tr);
    const [payTable, madeTable] = html.split("prepMadeHeading");
    for (const row of rowsOf(payTable)) expect(cellSpan(row)).toBe(8);
    for (const row of rowsOf(madeTable)) expect(cellSpan(row)).toBe(7);
  });

  it("prints the production workers the salary sheet leaves out", () => {
    const html = buildProductionPaySheetBodyHtml(paySheet(), tr);
    expect(html).toContain("Ravi");
    expect(html).toContain("Cap 28mm");
    expect(html).toContain("salarySheetPrintTotal");
    expectNoGarbage(html);
  });

  it("escapes worker and item names", () => {
    const sheet = paySheet();
    sheet.rows[0].name = HOSTILE_NAME;
    sheet.rows[0].items[0].itemName = HOSTILE_NAME;
    const html = buildProductionPaySheetBodyHtml(sheet, tr);
    expect(html).not.toContain("<script>");
  });

  it("survives a worker with no work at all", () => {
    const sheet = paySheet();
    sheet.rows[0].items = [];
    const html = buildProductionPaySheetBodyHtml(sheet, tr);
    expect(html).toContain("prepNoWork");
    expectNoGarbage(html);
  });

  it("survives an empty sheet", () => {
    const html = buildProductionPaySheetBodyHtml(
      paySheet({ rows: [] }),
      tr,
    );
    expect(html).toContain("prepEmptyTitle");
    expectNoGarbage(html);
  });
});

describe("the whole printed salary-sheet document", () => {
  it("carries both sections on the 'All' tab, with one stylesheet", () => {
    const html = buildPrintableHtml({
      rows: [salaryRow()],
      productionSheet: paySheet(),
      monthLabel: "July 2026",
      from: "2026-07-01",
      to: "2026-07-31",
      tr,
    });
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).toContain("Asha");
    expect(html).toContain("Ravi");
    expectNoGarbage(html);
    expectChrome109SafeCss(/<style>([\s\S]*?)<\/style>/.exec(html)![1]);
  });

  it("prints the production record alone on the production tab", () => {
    const html = buildPrintableHtml({
      rows: null,
      productionSheet: paySheet(),
      monthLabel: "July 2026",
      from: "2026-07-01",
      to: "2026-07-31",
      tr,
    });
    expect(html).toContain("Ravi");
    expect(html).not.toContain("salarySheetColSalary");
    expect(html).toContain("prepTitle");
  });
});

describe("production report print", () => {
  const rows = [
    { itemId: "i1", itemName: "Cap 28mm", dayQty: 10, nightQty: 5, qty: 15 },
    { itemId: "i2", itemName: HOSTILE_NAME, dayQty: 0, nightQty: 7, qty: 7 },
  ];

  it("prints 4 columns for 'both' and 2 for a single shift", () => {
    for (const [scope, expected] of [
      ["both", 4],
      ["day", 2],
      ["night", 2],
    ] as const) {
      const html = buildProductionReportHtml({
        rows,
        scope,
        periodLabel: "1 Jul – 31 Jul",
        tr,
      });
      for (const row of rowsOf(html)) expect(cellSpan(row)).toBe(expected);
    }
  });

  it("escapes an item named like a script tag", () => {
    const html = buildProductionReportHtml({
      rows,
      scope: "both",
      periodLabel: "1 Jul – 31 Jul",
      tr,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expectNoGarbage(html);
  });

  it("uses the shared shell and stylesheet, exactly once", () => {
    const html = buildProductionReportHtml({
      rows,
      scope: "both",
      periodLabel: "1 Jul – 31 Jul",
      tr,
    });
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).toContain(buildPrintStyles());
    expectChrome109SafeCss(/<style>([\s\S]*?)<\/style>/.exec(html)![1]);
  });

  it("spans the empty message across the whole table", () => {
    const html = buildProductionReportHtml({
      rows: [],
      scope: "both",
      periodLabel: "1 Jul – 31 Jul",
      tr,
    });
    const body = rowsOf(html).at(-1)!;
    expect(cellSpan(body)).toBe(4);
    expect(html).toContain("reportsNoProductionInPeriod");
  });
});
