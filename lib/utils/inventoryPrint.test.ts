/**
 * The inventory stock report, as printed HTML.
 *
 * "PDF export" for this report means the browser's own print-to-PDF of this
 * document — there is no PDF generator in the codebase — so the HTML string
 * is the whole artefact and can be checked without a browser.
 */
import { describe, expect, it } from "vitest";
import { buildInventoryPrintHtml } from "./inventoryPrint";
import type {
  InventoryItem,
  InventoryMovement,
} from "@/lib/services/inventoryService";

type StockRow = InventoryItem & { currentStock: number; isLow: boolean };

const HOSTILE = '<script>alert("x")</script>';

function row(overrides: Partial<StockRow> = {}): StockRow {
  return {
    id: "i1",
    code: "C1",
    name: "Cap 28mm",
    category: "container",
    unit: "pcs",
    openingStock: 40,
    lowStockThreshold: 25,
    sortOrder: 0,
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    currentStock: 90,
    isLow: false,
    ...overrides,
  } as StockRow;
}

const movements: InventoryMovement[] = [
  { id: "m1", itemId: "i1", date: "2026-07-01", type: "inward", qty: 60 },
  { id: "m2", itemId: "i1", date: "2026-07-02", type: "outward", qty: 10 },
] as InventoryMovement[];

function cellSpan(rowHtml: string): number {
  const cells = rowHtml.match(/<t[dh]\b[^>]*>/g) ?? [];
  return cells.reduce((total, cell) => {
    const span = /colspan="(\d+)"/.exec(cell);
    return total + (span ? Number(span[1]) : 1);
  }, 0);
}

const OPTS = { generatedAt: "2 Aug 2026, 10:00" };

describe("inventory print", () => {
  it("prints the eight stock columns, header and body agreeing", () => {
    const html = buildInventoryPrintHtml([row()], movements, OPTS);
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(cellSpan(r)).toBe(8);
  });

  it("shows opening, inward, outward and closing from the movement list", () => {
    const html = buildInventoryPrintHtml([row()], movements, OPTS);
    expect(html).toContain(">40<");
    expect(html).toContain(">60<");
    expect(html).toContain(">10<");
    expect(html).toContain(">90<");
  });

  it("escapes an item named like a script tag", () => {
    const html = buildInventoryPrintHtml(
      [row({ name: HOSTILE, code: HOSTILE })],
      movements,
      { ...OPTS, title: HOSTILE },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("leaves no undefined, NaN or [object Object] on the paper", () => {
    const html = buildInventoryPrintHtml(
      [row(), row({ id: "i2", code: "C2", isLow: true, currentStock: 3 })],
      movements,
      OPTS,
    );
    expect(html).not.toMatch(/undefined/);
    expect(html).not.toMatch(/NaN/);
    expect(html).not.toMatch(/\[object Object\]/);
  });

  it("counts the low-stock rows in the summary", () => {
    const html = buildInventoryPrintHtml(
      [row(), row({ id: "i2", code: "C2", isLow: true })],
      movements,
      OPTS,
    );
    expect(html).toContain("Total items: 2");
    expect(html).toContain("Low stock: 1");
  });

  it("prints only the requested category", () => {
    const html = buildInventoryPrintHtml(
      [row(), row({ id: "i2", code: "B1", category: "box" })],
      movements,
      { ...OPTS, category: "box" },
    );
    expect(html).toContain("B1");
    expect(html).not.toContain("C1");
    expect(html).toContain("Total items: 1");
  });

  it("uses only CSS a Chrome 109 print engine can parse", () => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(
      buildInventoryPrintHtml([row()], movements, OPTS),
    )![1];
    expect(css).not.toMatch(/color-mix\(/);
    expect(css).not.toMatch(/oklch\(/);
    expect(css).not.toMatch(/oklab\(/);
    expect(css).not.toMatch(/&/); // CSS nesting
  });

  it("emits a document with exactly one stylesheet", () => {
    const html = buildInventoryPrintHtml([row()], movements, OPTS);
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});
