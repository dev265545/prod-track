import { describe, expect, it } from "vitest";
import { currency } from "./formatter";

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
