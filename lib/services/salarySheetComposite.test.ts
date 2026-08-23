import { describe, expect, it } from "vitest";
import {
  getCompositeCorrectionSlices,
  mergeSalarySheetRows,
  resolveEffectiveSalarySheetRow,
} from "./salarySheetComposite";
import {
  resolveAdvanceDeductionAmount,
  type SalarySheetRow,
} from "./salarySheetService";
import type { SalarySheetOverrideRecord } from "./salarySheetOverrideService";

function buildRow(overrides: Partial<SalarySheetRow> = {}): SalarySheetRow {
  return {
    dayPayCap: { limit: 2, clippedDays: 0, clippedDates: 0 },
    id: "emp_1",
    name: "Asha",
    employeeType: "salaried",
    presentDays: 10,
    absentDays: 2,
    holidayPresentDays: 0,
    earnedSundayPayDays: 1,
    sundayPresentBonusDays: 1,
    totalPaidDays: 12,
    monthlySalary: 9000,
    ratePerDay: 300,
    ratePerHour: 37.5,
    hoursExtraTotal: 1,
    hoursReducedTotal: 0.5,
    baseCalculatedSalary: 3600,
    calculatedSalary: 3600,
    advanceDeduction: 0,
    netCalculatedSalary: 3600,
    hasOverrides: false,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: {},
    calculatedValues: {
      presentDays: 10,
      absentDays: 2,
      holidayPresentDays: 0,
      earnedSundayPayDays: 1,
      sundayPresentBonusDays: 1,
      totalPaidDays: 12,
      hoursExtraTotal: 1,
      hoursReducedTotal: 0.5,
      calculatedSalary: 3600,
      advanceDeduction: 0,
      netCalculatedSalary: 3600,
    },
    ...overrides,
  };
}

function buildOverrideRecord(
  fromDate: string,
  toDate: string,
  overrides: SalarySheetOverrideRecord["overrides"],
): SalarySheetOverrideRecord {
  return {
    id: `override:${fromDate}:${toDate}`,
    employeeId: "emp_1",
    year: 2026,
    month: 3,
    fromDate,
    toDate,
    notes: "",
    updatedAt: "2026-05-03T00:00:00.000Z",
    overrides,
  };
}

describe("getCompositeCorrectionSlices", () => {
  it("returns both halves for a full April 2026 month", () => {
    expect(
      getCompositeCorrectionSlices(2026, 3, "2026-04-01", "2026-04-30"),
    ).toEqual([
      expect.objectContaining({ fromDate: "2026-04-01", toDate: "2026-04-15" }),
      expect.objectContaining({ fromDate: "2026-04-16", toDate: "2026-04-30" }),
    ]);
  });

  it("returns a single slice for an exact half-month range", () => {
    expect(
      getCompositeCorrectionSlices(2026, 3, "2026-04-01", "2026-04-15"),
    ).toHaveLength(1);
  });
});

describe("resolveEffectiveSalarySheetRow", () => {
  it("merges first-half adjustment with calculated second half for full month", () => {
    const fullMonthBase = buildRow({
      presentDays: 22,
      absentDays: 4,
      earnedSundayPayDays: 3,
      sundayPresentBonusDays: 2,
      totalPaidDays: 27,
      calculatedSalary: 8100,
      calculatedValues: {
        presentDays: 22,
        absentDays: 4,
        holidayPresentDays: 0,
        earnedSundayPayDays: 3,
        sundayPresentBonusDays: 2,
        totalPaidDays: 27,
        hoursExtraTotal: 2,
        hoursReducedTotal: 1,
        calculatedSalary: 8100,
        advanceDeduction: 0,
        netCalculatedSalary: 8100,
      },
    });

    const employeeOverrides = [
      buildOverrideRecord("2026-04-01", "2026-04-15", {
        presentDays: 8,
        earnedSundayPayDays: 2,
        sundayPresentBonusDays: 2,
      }),
    ];

    const effective = resolveEffectiveSalarySheetRow(
      fullMonthBase,
      employeeOverrides,
      2026,
      3,
      "2026-04-01",
      "2026-04-30",
      (fromDate, toDate) => {
        if (fromDate === "2026-04-01" && toDate === "2026-04-15") {
          return buildRow({
            presentDays: 11,
            absentDays: 2,
            earnedSundayPayDays: 1,
            sundayPresentBonusDays: 1,
            totalPaidDays: 13,
            calculatedSalary: 3900,
            calculatedValues: {
              presentDays: 11,
              absentDays: 2,
              holidayPresentDays: 0,
              earnedSundayPayDays: 1,
              sundayPresentBonusDays: 1,
              totalPaidDays: 13,
              hoursExtraTotal: 1,
              hoursReducedTotal: 0.5,
              calculatedSalary: 3900,
              advanceDeduction: 0,
              netCalculatedSalary: 3900,
            },
          });
        }
        return buildRow({
          presentDays: 11,
          absentDays: 2,
          earnedSundayPayDays: 2,
          sundayPresentBonusDays: 1,
          totalPaidDays: 14,
          calculatedSalary: 4200,
          calculatedValues: {
            presentDays: 11,
            absentDays: 2,
            holidayPresentDays: 0,
            earnedSundayPayDays: 2,
            sundayPresentBonusDays: 1,
            totalPaidDays: 14,
            hoursExtraTotal: 1,
            hoursReducedTotal: 0.5,
            calculatedSalary: 4200,
            advanceDeduction: 0,
            netCalculatedSalary: 4200,
          },
        });
      },
    );

    expect(effective.presentDays).toBe(19);
    expect(effective.earnedSundayPayDays).toBe(4);
    expect(effective.sundayPresentBonusDays).toBe(3);
    expect(effective.totalPaidDays).toBe(26);
    expect(effective.calculatedSalary).toBe(7800);
    expect(effective.hasOverrides).toBe(true);
  });

  it("prefers an exact full-month override over half-month records", () => {
    const fullMonthBase = buildRow();
    const employeeOverrides = [
      buildOverrideRecord("2026-04-01", "2026-04-15", { presentDays: 8 }),
      buildOverrideRecord("2026-04-01", "2026-04-30", { presentDays: 20 }),
    ];

    const effective = resolveEffectiveSalarySheetRow(
      fullMonthBase,
      employeeOverrides,
      2026,
      3,
      "2026-04-01",
      "2026-04-30",
      () => fullMonthBase,
    );

    expect(effective.presentDays).toBe(20);
  });
});

describe("mergeSalarySheetRows", () => {
  it("sums payroll fields across slices", () => {
    const merged = mergeSalarySheetRows([
      buildRow({ presentDays: 8, calculatedSalary: 2400, hasOverrides: true }),
      buildRow({ presentDays: 10, calculatedSalary: 3000 }),
    ]);

    expect(merged.presentDays).toBe(18);
    expect(merged.calculatedSalary).toBe(5400);
    expect(merged.hasOverrides).toBe(true);
  });

  it("sums advanceDeduction and netCalculatedSalary across slices instead of taking the first slice's value", () => {
    const merged = mergeSalarySheetRows([
      buildRow({
        calculatedSalary: 2400,
        advanceDeduction: 300,
        netCalculatedSalary: 2100,
        calculatedValues: {
          presentDays: 10,
          absentDays: 2,
          holidayPresentDays: 0,
          earnedSundayPayDays: 1,
          sundayPresentBonusDays: 1,
          totalPaidDays: 12,
          hoursExtraTotal: 1,
          hoursReducedTotal: 0.5,
          calculatedSalary: 2400,
          advanceDeduction: 300,
          netCalculatedSalary: 2100,
        },
      }),
      buildRow({
        calculatedSalary: 3000,
        advanceDeduction: 200,
        netCalculatedSalary: 2800,
        calculatedValues: {
          presentDays: 10,
          absentDays: 2,
          holidayPresentDays: 0,
          earnedSundayPayDays: 1,
          sundayPresentBonusDays: 1,
          totalPaidDays: 12,
          hoursExtraTotal: 1,
          hoursReducedTotal: 0.5,
          calculatedSalary: 3000,
          advanceDeduction: 200,
          netCalculatedSalary: 2800,
        },
      }),
    ]);

    expect(merged.advanceDeduction).toBe(500);
    expect(merged.netCalculatedSalary).toBe(4900);
    expect(merged.calculatedValues.advanceDeduction).toBe(500);
    expect(merged.calculatedValues.netCalculatedSalary).toBe(4900);
  });
});

/* ------------------------------------------------------------------------ *
 * Advance deductions across a half-month correction.
 *
 * The bug: an advance deduction recorded against the whole of July silently
 * became ZERO the moment the owner corrected only the first half. The month
 * was then rebuilt out of half-month slices, neither slice matched the
 * full-month deduction record, 0 + 0 was merged, and the owner handed over a
 * full salary with an advance they had already paid out never cut.
 * ------------------------------------------------------------------------ */

type DeductionRecord = Record<string, unknown>;

/**
 * Verbatim copy of the previous advance-deduction resolution (exact
 * periodFrom/periodTo match, first record wins). Kept per the payroll
 * convention so the new resolution can be swept against it: it must agree
 * everywhere the old answer was already right.
 */
function previousResolveAdvanceDeductionAmount(
  deductions: DeductionRecord[],
  rangeFrom: string,
  rangeTo: string,
): number {
  const match = deductions.find(
    (d) => d.periodFrom === rangeFrom && d.periodTo === rangeTo,
  );
  return (match?.amount as number) ?? 0;
}

const JULY_FROM = "2026-07-01";
const JULY_TO = "2026-07-31";
const JULY_H1_TO = "2026-07-15";
const JULY_H2_FROM = "2026-07-16";

/** July 2026 is month index 6. Half slices are 01–15 and 16–31. */
const JULY_YEAR = 2026;
const JULY_MONTH = 6;

/** Base row for a range, with the advance deduction resolved for real. */
function buildJulyBase(
  deductions: DeductionRecord[],
  fromDate: string,
  toDate: string,
): SalarySheetRow {
  // Half a month is half the pay; the whole month is the whole pay.
  const isHalf = fromDate !== JULY_FROM || toDate !== JULY_TO;
  const presentDays = isHalf ? 13 : 26;
  const calculatedSalary = presentDays * 300;
  const advanceDeduction = resolveAdvanceDeductionAmount(
    deductions,
    fromDate,
    toDate,
  );
  const netCalculatedSalary = Math.max(0, calculatedSalary - advanceDeduction);
  return buildRow({
    presentDays,
    absentDays: 0,
    earnedSundayPayDays: 0,
    sundayPresentBonusDays: 0,
    totalPaidDays: presentDays,
    hoursExtraTotal: 0,
    hoursReducedTotal: 0,
    baseCalculatedSalary: calculatedSalary,
    calculatedSalary,
    advanceDeduction,
    netCalculatedSalary,
    calculatedValues: {
      presentDays,
      absentDays: 0,
      holidayPresentDays: 0,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 0,
      totalPaidDays: presentDays,
      hoursExtraTotal: 0,
      hoursReducedTotal: 0,
      calculatedSalary,
      advanceDeduction,
      netCalculatedSalary,
    },
  });
}

function resolveJulyRow(
  deductions: DeductionRecord[],
  employeeOverrides: SalarySheetOverrideRecord[],
) {
  return resolveEffectiveSalarySheetRow(
    buildJulyBase(deductions, JULY_FROM, JULY_TO),
    employeeOverrides,
    JULY_YEAR,
    JULY_MONTH,
    JULY_FROM,
    JULY_TO,
    (fromDate, toDate) => buildJulyBase(deductions, fromDate, toDate),
  );
}

/** A first-half correction, the trigger for the slice path. */
const FIRST_HALF_CORRECTION = [
  buildOverrideRecord(JULY_FROM, JULY_H1_TO, { presentDays: 12 }),
];

describe("advance deductions survive a half-month correction", () => {
  it("applies a whole-month deduction exactly once when only the first half is corrected", () => {
    const deductions = [
      { periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 2000 },
    ];

    const effective = resolveJulyRow(deductions, FIRST_HALF_CORRECTION);

    // The correction drops one present day from the first half: 25 days.
    expect(effective.presentDays).toBe(25);
    expect(effective.calculatedSalary).toBe(7500);
    // The advance is cut once, not zero times and not twice.
    expect(effective.advanceDeduction).toBe(2000);
    expect(effective.netCalculatedSalary).toBe(5500);
    expect(effective.calculatedValues.advanceDeduction).toBe(2000);
  });

  it("does not double-count a deduction recorded per half-month", () => {
    const deductions = [
      { periodFrom: JULY_FROM, periodTo: JULY_H1_TO, amount: 1000 },
      { periodFrom: JULY_H2_FROM, periodTo: JULY_TO, amount: 1000 },
    ];

    const effective = resolveJulyRow(deductions, FIRST_HALF_CORRECTION);

    expect(effective.advanceDeduction).toBe(2000);
    expect(effective.netCalculatedSalary).toBe(5500);
  });

  it("deducts nothing when there is no deduction record", () => {
    const effective = resolveJulyRow([], FIRST_HALF_CORRECTION);

    expect(effective.advanceDeduction).toBe(0);
    expect(effective.netCalculatedSalary).toBe(7500);
  });

  it("ignores a deduction whose period only partly overlaps the sheet range", () => {
    const deductions = [
      // Straddles the month end: it belongs to a period this sheet is not paying.
      { periodFrom: "2026-07-20", periodTo: "2026-08-05", amount: 2000 },
    ];

    const effective = resolveJulyRow(deductions, FIRST_HALF_CORRECTION);

    expect(effective.advanceDeduction).toBe(0);
    expect(effective.netCalculatedSalary).toBe(7500);
  });

  it("leaves an uncorrected month exactly as the whole-range base row computed it", () => {
    const deductions = [
      { periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 2000 },
    ];
    const base = buildJulyBase(deductions, JULY_FROM, JULY_TO);

    const effective = resolveEffectiveSalarySheetRow(
      base,
      [],
      JULY_YEAR,
      JULY_MONTH,
      JULY_FROM,
      JULY_TO,
      (fromDate, toDate) => buildJulyBase(deductions, fromDate, toDate),
    );

    expect(effective).toBe(base);
    expect(effective.advanceDeduction).toBe(2000);
    expect(effective.netCalculatedSalary).toBe(5800);
  });

  it("keeps an explicit advanceDeduction correction, and still cuts the month-wide advance once", () => {
    const deductions = [
      { periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 2000 },
    ];
    const overrides = [
      buildOverrideRecord(JULY_FROM, JULY_H1_TO, { advanceDeduction: 500 }),
    ];

    const effective = resolveJulyRow(deductions, overrides);

    expect(effective.advanceDeduction).toBe(2500);
    expect(effective.netCalculatedSalary).toBe(7800 - 2500);
  });
});

describe("resolveAdvanceDeductionAmount agrees with the previous resolution", () => {
  const shapes: Array<{ name: string; deductions: DeductionRecord[] }> = [
    { name: "no records", deductions: [] },
    {
      name: "whole-month record",
      deductions: [{ periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 2000 }],
    },
    {
      name: "half-month records",
      deductions: [
        { periodFrom: JULY_FROM, periodTo: JULY_H1_TO, amount: 1000 },
        { periodFrom: JULY_H2_FROM, periodTo: JULY_TO, amount: 1200 },
      ],
    },
    {
      name: "record for a different month",
      deductions: [
        { periodFrom: "2026-06-01", periodTo: "2026-06-30", amount: 900 },
      ],
    },
    {
      name: "record straddling the month end",
      deductions: [
        { periodFrom: "2026-07-20", periodTo: "2026-08-05", amount: 700 },
      ],
    },
    {
      name: "record with a zero amount",
      deductions: [{ periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 0 }],
    },
    {
      name: "two records for the identical period",
      deductions: [
        { periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 300 },
        { periodFrom: JULY_FROM, periodTo: JULY_TO, amount: 400 },
      ],
    },
  ];

  const ranges: Array<[string, string]> = [
    [JULY_FROM, JULY_TO],
    [JULY_FROM, JULY_H1_TO],
    [JULY_H2_FROM, JULY_TO],
    ["2026-06-01", "2026-06-30"],
  ];

  for (const shape of shapes) {
    for (const [from, to] of ranges) {
      const previous = previousResolveAdvanceDeductionAmount(
        shape.deductions,
        from,
        to,
      );
      // The new rule is strictly additive: it only looks for contained records
      // when the old rule found nothing at all. Everywhere the old answer was
      // non-zero — every shape the app already got right — it must be identical.
      if (previous !== 0) {
        it(`matches the previous answer for ${shape.name} over ${from}..${to}`, () => {
          expect(
            resolveAdvanceDeductionAmount(shape.deductions, from, to),
          ).toBe(previous);
        });
      }
    }
  }

  it("only differs by picking up records the range fully contains", () => {
    for (const shape of shapes) {
      for (const [from, to] of ranges) {
        const previous = previousResolveAdvanceDeductionAmount(
          shape.deductions,
          from,
          to,
        );
        const next = resolveAdvanceDeductionAmount(shape.deductions, from, to);
        if (next !== previous) {
          expect(previous).toBe(0);
          const contained = shape.deductions.filter(
            (d) =>
              (d.periodFrom as string) >= from && (d.periodTo as string) <= to,
          );
          expect(next).toBe(
            contained.reduce((t, d) => t + (d.amount as number), 0),
          );
        }
      }
    }
  });
});
