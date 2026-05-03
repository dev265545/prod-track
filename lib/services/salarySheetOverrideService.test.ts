import { describe, expect, it } from "vitest";
import {
  getSalarySheetCorrectionPeriodForRange,
  getSalarySheetCorrectionPeriods,
} from "./salarySheetOverrideService";

describe("salarySheetOverrideService periods", () => {
  it("returns exactly two correction periods for a month", () => {
    expect(getSalarySheetCorrectionPeriods(2026, 4)).toEqual([
      {
        key: "first-half",
        fromDate: "2026-05-01",
        toDate: "2026-05-15",
        label: "1-15 May 2026",
      },
      {
        key: "second-half",
        fromDate: "2026-05-16",
        toDate: "2026-05-31",
        label: "16-31 May 2026",
      },
    ]);
  });

  it("matches only exact half-month ranges", () => {
    expect(
      getSalarySheetCorrectionPeriodForRange(
        2026,
        4,
        "2026-05-01",
        "2026-05-15",
      )?.key,
    ).toBe("first-half");
    expect(
      getSalarySheetCorrectionPeriodForRange(
        2026,
        4,
        "2026-05-01",
        "2026-05-31",
      ),
    ).toBeNull();
  });
});
