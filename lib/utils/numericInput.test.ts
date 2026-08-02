import { describe, it, expect } from "vitest";
import {
  clampNumericInput,
  parseNumericInput,
  resolveIncomingNumericValue,
  sanitizeNumericInput,
} from "./numericInput";

describe("sanitizeNumericInput", () => {
  it("rejects letters", () => {
    expect(sanitizeNumericInput("12abc")).toBe("12");
    expect(sanitizeNumericInput("dev")).toBe("");
    expect(sanitizeNumericInput("1d2e3v")).toBe("123");
  });

  it("rejects the scientific-notation characters a number input allows", () => {
    expect(sanitizeNumericInput("1e5")).toBe("15");
    expect(sanitizeNumericInput("1E5")).toBe("15");
    expect(sanitizeNumericInput("+5")).toBe("5");
    expect(sanitizeNumericInput("-5")).toBe("5");
    expect(sanitizeNumericInput("1 2")).toBe("12");
  });

  it("allows a decimal point only when decimals are enabled", () => {
    expect(sanitizeNumericInput("1.5")).toBe("15");
    expect(sanitizeNumericInput("1.5", { decimal: true })).toBe("1.5");
  });

  it("allows at most one decimal point", () => {
    expect(sanitizeNumericInput("1.2.3", { decimal: true })).toBe("1.23");
  });

  it("treats a comma as a decimal separator rather than dropping it", () => {
    expect(sanitizeNumericInput("1,5", { decimal: true })).toBe("1.5");
  });

  it("allows an empty string so a field can be cleared", () => {
    expect(sanitizeNumericInput("")).toBe("");
    expect(sanitizeNumericInput("", { decimal: true })).toBe("");
  });

  it("preserves leading zeros the user typed", () => {
    expect(sanitizeNumericInput("007")).toBe("007");
    expect(sanitizeNumericInput("0.50", { decimal: true })).toBe("0.50");
  });

  it("does not mangle a valid partial entry", () => {
    expect(sanitizeNumericInput("12.", { decimal: true })).toBe("12.");
    expect(sanitizeNumericInput(".", { decimal: true })).toBe(".");
    expect(sanitizeNumericInput(".5", { decimal: true })).toBe(".5");
  });
});

describe("resolveIncomingNumericValue", () => {
  it("filters a value that arrives with letters in it (autofill, paste, programmatic set)", () => {
    // The client's screenshot: Chrome filled the machine's username into
    // "How many". It must never reach the caller's state.
    expect(resolveIncomingNumericValue("dev")).toBe("");
    expect(resolveIncomingNumericValue("12dev")).toBe("12");
    expect(resolveIncomingNumericValue("1e5")).toBe("15");
    expect(resolveIncomingNumericValue("3.5kg", { decimal: true })).toBe("3.5");
  });

  it("passes numbers through untouched", () => {
    expect(resolveIncomingNumericValue(0)).toBe("0");
    expect(resolveIncomingNumericValue(1.2)).toBe("1.2");
    expect(resolveIncomingNumericValue(Number.NaN)).toBe("");
  });

  it("renders nullish values as an empty field", () => {
    expect(resolveIncomingNumericValue(undefined)).toBe("");
    expect(resolveIncomingNumericValue(null)).toBe("");
  });
});

describe("parseNumericInput", () => {
  it("returns null for entries that are not a number yet", () => {
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput(".")).toBeNull();
  });

  it("parses complete and partial-but-valid entries", () => {
    expect(parseNumericInput("12.")).toBe(12);
    expect(parseNumericInput("007")).toBe(7);
    expect(parseNumericInput("1.5")).toBe(1.5);
  });
});

describe("clampNumericInput", () => {
  it("applies the bounds the browser used to enforce", () => {
    expect(clampNumericInput("0", { min: 1 })).toBe("1");
    expect(clampNumericInput("30", { max: 24 })).toBe("24");
    expect(clampNumericInput("5", { min: 1, max: 24 })).toBe("5");
  });

  it("leaves a mid-entry value alone instead of snapping it", () => {
    expect(clampNumericInput("", { min: 1 })).toBe("");
    expect(clampNumericInput(".", { min: 1 })).toBe(".");
  });

  it("does not rewrite an in-range value's formatting", () => {
    expect(clampNumericInput("007", { min: 1 })).toBe("007");
  });
});
