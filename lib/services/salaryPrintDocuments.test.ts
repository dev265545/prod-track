/**
 * The two DB-backed printable employee documents, exercised through the real
 * IndexedDB adapter (fake-indexeddb).
 *
 * These need the database because the employee name and the item names — the
 * values that used to reach the printed HTML unescaped — are read from it.
 * Again: nothing here generates a PDF. The app prints this HTML through a
 * browser and the owner saves it as one.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrintStyles } from "@/lib/print/styles";

// lib/db/indexeddb.ts caches its open handle at module scope, so the handle
// has to be closed and the modules reset before each database is deleted.
beforeEach(async () => {
  const { DB_NAME } = await import("@/lib/db/schema");
  try {
    const { openDB } = await import("@/lib/db/adapter");
    const db = (await openDB()) as IDBDatabase | undefined;
    db?.close?.();
  } catch {
    /* first test in the file: nothing open yet */
  }
  vi.resetModules();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

const HOSTILE = '<script>alert("x")</script>';

function styleBlocksOf(html: string): string[] {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

function expectNoGarbage(html: string) {
  expect(html).not.toMatch(/undefined/);
  expect(html).not.toMatch(/NaN/);
  expect(html).not.toMatch(/\[object Object\]/);
}

function expectChrome109SafeCss(css: string) {
  expect(css).not.toMatch(/color-mix\(/);
  expect(css).not.toMatch(/oklch\(/);
  expect(css).not.toMatch(/oklab\(/);
  expect(css).not.toMatch(/lch\(/);
  expect(css).not.toMatch(/&/);
}

/** One employee with one day of production and one advance. */
async function seed({
  employeeName = "Asha",
  itemName = "Cap 28mm",
}: { employeeName?: string; itemName?: string } = {}) {
  const { saveEmployee } = await import("./employeeService");
  const { saveItem } = await import("./itemService");
  const { saveProduction } = await import("./productionService");
  const { saveAdvance } = await import("./advanceService");

  const emp = await saveEmployee({ name: employeeName, monthlySalary: 9000 });
  const item = await saveItem({ name: itemName, rate: 10 });
  await saveProduction({
    employeeId: emp.id,
    itemId: item.id,
    date: "2026-04-10",
    shift: "day",
    quantity: 100,
  });
  await saveAdvance({
    employeeId: emp.id,
    date: "2026-04-11",
    amount: 400,
  });
  return { employeeId: emp.id as string };
}

describe("printable production & advances document", () => {
  it("prints the employee, the item and the totals", async () => {
    const { employeeId } = await seed();
    const { getPrintableSalaryHtml } = await import("./salaryService");
    const { html, employeeName } = await getPrintableSalaryHtml(
      employeeId,
      "2026-04-01",
      "2026-04-30",
    );
    expect(employeeName).toBe("Asha");
    expect(html).toContain("Asha");
    expect(html).toContain("Cap 28mm");
    expect(html).toContain("₹1,000"); // 100 × ₹10
    expectNoGarbage(html);
  });

  it("carries the shared stylesheet exactly once", async () => {
    const { employeeId } = await seed();
    const { getPrintableSalaryHtml } = await import("./salaryService");
    const { html } = await getPrintableSalaryHtml(
      employeeId,
      "2026-04-01",
      "2026-04-30",
    );
    const blocks = styleBlocksOf(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(buildPrintStyles());
    expectChrome109SafeCss(blocks[0]);
  });

  it("escapes an employee and an item named like a script tag", async () => {
    const { employeeId } = await seed({
      employeeName: HOSTILE,
      itemName: HOSTILE,
    });
    const { getPrintableSalaryHtml } = await import("./salaryService");
    const { html } = await getPrintableSalaryHtml(
      employeeId,
      "2026-04-01",
      "2026-04-30",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an ampersand in an item name rather than emitting a stray entity", async () => {
    const { employeeId } = await seed({ itemName: "Cap & Poly" });
    const { getPrintableSalaryHtml } = await import("./salaryService");
    const { html } = await getPrintableSalaryHtml(
      employeeId,
      "2026-04-01",
      "2026-04-30",
    );
    expect(html).toContain("Cap &amp; Poly");
    expect(html).not.toContain("Cap & Poly");
  });

  it("survives a period with no production and no advances", async () => {
    const { employeeId } = await seed();
    const { getPrintableSalaryHtml } = await import("./salaryService");
    const { html } = await getPrintableSalaryHtml(
      employeeId,
      "2026-05-01",
      "2026-05-31",
    );
    expect(html).toContain("No production in this period.");
    expect(html).toContain("No advances.");
    expectNoGarbage(html);
  });
});

describe("printable monthly attendance sheet", () => {
  it("carries the shared stylesheet once and escapes the employee name", async () => {
    const { employeeId } = await seed({ employeeName: HOSTILE });
    const { getPrintableMonthlyAttendanceSheetHtml } = await import(
      "./salaryService"
    );
    const { html } = await getPrintableMonthlyAttendanceSheetHtml(
      employeeId,
      2026,
      4,
    );
    const blocks = styleBlocksOf(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(
      buildPrintStyles({ tableFontSize: 10, cellPadding: "3px 5px" }),
    );
    expectChrome109SafeCss(blocks[0]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expectNoGarbage(html);
  });

  it("still produces a styled document when the employee is gone", async () => {
    const { getPrintableMonthlyAttendanceSheetHtml } = await import(
      "./salaryService"
    );
    const { html } = await getPrintableMonthlyAttendanceSheetHtml(
      "no_such_employee",
      2026,
      4,
    );
    expect(styleBlocksOf(html)).toHaveLength(1);
    expect(html).toContain("Employee not found.");
    expectNoGarbage(html);
  });
});
