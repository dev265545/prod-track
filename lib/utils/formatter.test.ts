import { describe, expect, it } from "vitest";
import { currency, number } from "./formatter";

/**
 * `currency` is the last step before a number reaches a payslip. It used to
 * print with `maximumFractionDigits: 0`, so an amount stored as 1250.50 was
 * printed as ₹1,251 — the stored value and the printed value were different
 * numbers, and the paise of piece-rate work vanished.
 */
describe("currency", () => {
  it("prints whole rupees with no trailing decimals", () => {
    expect(currency(0)).toBe("₹0");
    expect(currency(15000)).toBe("₹15,000");
    expect(currency(-150)).toBe("-₹150");
  });

  it("prints paise when the stored amount has them", () => {
    expect(currency(1250.5)).toBe("₹1,250.50");
    expect(currency(0.3)).toBe("₹0.30");
    expect(currency(12.5)).toBe("₹12.50");
  });

  it("still guards against null and NaN", () => {
    expect(currency(null)).toBe("₹ 0");
    expect(currency(undefined)).toBe("₹ 0");
    expect(currency("abc")).toBe("₹ 0");
  });
});

/**
 * Both formatters cache their `Intl.NumberFormat` at module level (constructing
 * one per call cost ~60x more on the hot path of every table). These pin the
 * exact string for every shape the cache has to keep straight — the paise /
 * no-paise split, the sign, non-finite values and coercible non-numbers — so
 * any drift in the cached instances is caught rather than shipped to a payslip.
 */
describe("currency / number: exact output is pinned across the cache", () => {
  const cases: Array<[unknown, string, string]> = [
    // value, currency(), number()
    [0, "₹0", "0"],
    [-0, "-₹0", "-0"],
    [15000, "₹15,000", "15,000"],
    [-150, "-₹150", "-150"],
    [1250.5, "₹1,250.50", "1,250.5"],
    [-1250.5, "-₹1,250.50", "-1,250.5"],
    [0.3, "₹0.30", "0.3"],
    [12.5, "₹12.50", "12.5"],
    // Sub-paise rounds the way the un-cached formatter rounded it.
    [0.005, "₹0.01", "0.005"],
    [-0.005, "-₹0", "-0.005"],
    // Indian grouping (lakh/crore), not thousands.
    [1234567.89, "₹12,34,567.89", "12,34,567.89"],
    [99999999.99, "₹9,99,99,999.99", "9,99,99,999.99"],
    [
      1e21,
      "₹1,00,00,00,00,00,00,00,00,00,000.00",
      "1,00,00,00,00,00,00,00,00,00,000",
    ],
    [Infinity, "₹∞", "∞"],
    [-Infinity, "-₹∞", "-∞"],
    // Non-numbers that `Number()` coerces rather than rejects.
    ["42.5", "₹42.50", "42.5"],
    ["", "₹0", "0"],
    [true, "₹1", "1"],
  ];

  it.each(cases)("formats %p", (value, expectedCurrency, expectedNumber) => {
    expect(currency(value)).toBe(expectedCurrency);
    expect(number(value)).toBe(expectedNumber);
  });

  it("guards null/undefined/NaN", () => {
    expect(number(null)).toBe("0");
    expect(number(undefined)).toBe("0");
    expect(number("abc")).toBe("0");
    expect(number(NaN)).toBe("0");
    expect(currency(NaN)).toBe("₹ 0");
  });

  it("does not leak the paise setting between calls", () => {
    expect(currency(1250.5)).toBe("₹1,250.50");
    expect(currency(15000)).toBe("₹15,000");
    expect(currency(1250.5)).toBe("₹1,250.50");
    expect(currency(15000)).toBe("₹15,000");
  });
});
