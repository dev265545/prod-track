/**
 * Tests for the three per-employee printable documents built in
 * salaryService.ts.
 *
 * There is no PDF generator anywhere in this codebase: "PDF export" means the
 * HTML string below is handed to a browser (or the Tauri printer plugin) and
 * the owner picks "Save as PDF". The HTML IS the artefact, so it can be
 * asserted on with no browser at all — which is what happens here.
 *
 * What these guard:
 *  - user-typed text (employee names, item names, attendance status labels)
 *    is escaped, so an item called `A & B` cannot corrupt the row and a name
 *    that looks like a `<script>` tag cannot execute,
 *  - the shared stylesheet appears exactly once per document (it used to be
 *    inlined by hand, three separate near-copies of it),
 *  - the CSS stays parseable by Chrome 109, the oldest browser this ships to,
 *  - no "undefined" / "NaN" / "[object Object]" reaches the paper.
 */

import { describe, expect, it } from "vitest";
import { buildPrintableAttendanceSalaryRangeHtml } from "./salaryService";
import { buildPrintStyles } from "@/lib/print/styles";
import type { MonthSalaryDayRow } from "@/lib/utils/attendanceStats";

const HOSTILE_NAME = '<script>alert("x")</script>';

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
  // CSS nesting: a `&` outside a string is the giveaway.
  expect(css).not.toMatch(/&/);
}

function styleBlocksOf(html: string): string[] {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

function dayRow(overrides: Partial<MonthSalaryDayRow> = {}): MonthSalaryDayRow {
  return {
    date: "2026-04-10",
    weekdayShort: "Fri",
    rowKind: "working",
    statusLabel: "Present",
    hoursWorked: null,
    hoursExtra: 2,
    hoursReduced: null,
    effectiveHours: 10,
    paidFraction: 1.25,
    basePay: 375,
    productionPay: 0,
    ...overrides,
  } as MonthSalaryDayRow;
}

function rangeHtml(
  overrides: Partial<
    Parameters<typeof buildPrintableAttendanceSalaryRangeHtml>[0]
  > = {},
) {
  return buildPrintableAttendanceSalaryRangeHtml({
    employeeName: "Asha",
    monthLabel: "April 2026",
    rangeLabel: "10-15 Apr 2026",
    fromDate: "2026-04-10",
    toDate: "2026-04-15",
    monthlySalary: 9000,
    ratePerDay: 300,
    ratePerHour: 38,
    summary: {
      presentDays: 1.75,
      absentDays: 3,
      holidayPresentDays: 0,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 0,
      totalPaidDays: 1.75,
      totalHoursWorked: 14,
      hoursExtraTotal: 2,
      hoursReducedTotal: 4,
      calculatedSalary: 525,
    },
    dayRows: [
      dayRow(),
      dayRow({
        date: "2026-04-11",
        weekdayShort: "Sat",
        hoursExtra: null,
        hoursReduced: 4,
        effectiveHours: 4,
        paidFraction: 0.5,
        basePay: 150,
      }),
    ],
    ...overrides,
  });
}

describe("attendance-salary range print", () => {
  it("renders per-day attendance rows for the selected range", () => {
    const html = rangeHtml();
    expect(html).toContain("Daily breakdown");
    expect(html).toContain("10 Apr 2026");
    expect(html).toContain("Present");
    expect(html).toContain("1.25");
    expect(html).toContain("₹375");
    expect(html).toContain("15 Apr 2026");
    expectNoGarbage(html);
  });

  it("embeds the shared stylesheet exactly once, and nothing else", () => {
    const blocks = styleBlocksOf(rangeHtml());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(buildPrintStyles({ cellPadding: "5px 6px" }));
    expectChrome109SafeCss(blocks[0]);
  });

  it("escapes an employee named like a script tag", () => {
    const html = rangeHtml({ employeeName: HOSTILE_NAME });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // …in the <title> as well as the body — both used to be raw.
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("escapes an ampersand in a status label instead of corrupting the row", () => {
    const html = rangeHtml({
      dayRows: [dayRow({ statusLabel: "Half day & leave" })],
    });
    expect(html).toContain("Half day &amp; leave");
    expect(html).not.toContain("Half day & leave");
  });

  it("prints an em dash, not 'undefined', for hours that were never recorded", () => {
    const html = rangeHtml({
      dayRows: [
        dayRow({
          hoursWorked: null,
          hoursExtra: null,
          hoursReduced: null,
          effectiveHours: null,
        }),
      ],
    });
    expect(html).toContain("—");
    expectNoGarbage(html);
  });

  it("spans the empty message across every column", () => {
    const html = rangeHtml({ dayRows: [] });
    expect(html).toContain('colspan="9"');
    expect(html).toContain("No attendance rows in this range.");
    expectNoGarbage(html);
  });

  it("keeps header and body cell counts equal", () => {
    const html = rangeHtml();
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
    for (const row of rows) {
      const cells = row.match(/<t[dh]\b[^>]*>/g) ?? [];
      const span = cells.reduce((total, cell) => {
        const m = /colspan="(\d+)"/.exec(cell);
        return total + (m ? Number(m[1]) : 1);
      }, 0);
      expect(span).toBe(9);
    }
  });
});
