import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/components/language-provider";
import { SalarySheetRowCells } from "@/components/salary-sheet/salary-sheet-row-cells";
import { SALARY_SHEET_COLUMNS } from "@/lib/print/salarySheet";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";

function buildRow(overrides: Partial<SalarySheetRow> = {}): SalarySheetRow {
  return {
    id: "emp_1",
    name: "Asha",
    employeeType: "salaried",
    presentDays: 22,
    absentDays: 4,
    holidayPresentDays: 1,
    earnedSundayPayDays: 3,
    sundayPresentBonusDays: 2,
    totalPaidDays: 27,
    monthlySalary: 9000,
    ratePerDay: 300,
    ratePerHour: 37.5,
    hoursExtraTotal: 2,
    hoursReducedTotal: 1,
    baseCalculatedSalary: 8100,
    calculatedSalary: 8100,
    advanceDeduction: 0,
    netCalculatedSalary: 8100,
    hasOverrides: false,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: {},
    calculatedValues: {
      presentDays: 22,
      absentDays: 4,
      holidayPresentDays: 1,
      earnedSundayPayDays: 3,
      sundayPresentBonusDays: 2,
      totalPaidDays: 27,
      hoursExtraTotal: 2,
      hoursReducedTotal: 1,
      calculatedSalary: 8100,
      advanceDeduction: 0,
      netCalculatedSalary: 8100,
    },
    dayPayCap: { limit: 2, clippedDays: 0, clippedDates: 0 },
    ...overrides,
  };
}

/** Renders the cells inside the table markup they need to be legal children of. */
function renderCells(
  row: SalarySheetRow,
  { hasAdjustment = false }: { hasAdjustment?: boolean } = {},
) {
  return render(
    <LanguageProvider>
      <table>
        <tbody>
          <tr>
            <SalarySheetRowCells row={row} hasAdjustment={hasAdjustment} />
          </tr>
        </tbody>
      </table>
    </LanguageProvider>,
  );
}

describe("SalarySheetRowCells", () => {
  it("renders one cell per sheet column, in order", () => {
    const { container } = renderCells(buildRow());
    expect(container.querySelectorAll("tr > *")).toHaveLength(
      SALARY_SHEET_COLUMNS.length,
    );
  });

  it("shows the money and day columns for the row", () => {
    renderCells(buildRow());
    // Salary and the monthly figure, formatted as rupees.
    expect(screen.getByText("₹8,100")).toBeInTheDocument();
    expect(screen.getByText("₹9,000")).toBeInTheDocument();
    // Paid days.
    expect(screen.getByText("27")).toBeInTheDocument();
  });

  it("links the name cell to that employee and marks it as the row header", () => {
    const { container } = renderCells(buildRow({ id: "emp 7", name: "Asha" }));
    const link = screen.getByRole("link", { name: /Asha/ });
    expect(link).toHaveAttribute("href", "/employee?id=emp%207");
    const header = container.querySelector("th[scope='row']");
    expect(header).toContainElement(link);
  });

  it("flags a row that was corrected by hand, and leaves a clean row unflagged", () => {
    const { unmount } = renderCells(buildRow(), { hasAdjustment: true });
    expect(screen.getByText(/\(.+\)/)).toBeInTheDocument();
    unmount();

    const { container } = renderCells(buildRow(), { hasAdjustment: false });
    expect(container.querySelector(".text-warning")).toBeNull();
  });

  /**
   * The reason this component exists. Painting the table calls
   * `currency()`/`number()` once per cell and each builds a fresh
   * `Intl.NumberFormat` — on a 150-person sheet that is the dominant cost of
   * the screen. A parent re-render that does not change the row (toggling
   * reorder mode, the save flag flipping, two other rows swapping) must not
   * pay it again.
   */
  it("does not re-format its cells when the parent re-renders with the same row", async () => {
    const row = buildRow();
    const salaryColumn = SALARY_SHEET_COLUMNS.find(
      (col) => col.key === "calculatedSalary",
    )!;
    const formatSpy = vi.spyOn(salaryColumn, "format");

    function Host() {
      const [tick, setTick] = React.useState(0);
      return (
        <LanguageProvider>
          <button type="button" onClick={() => setTick(tick + 1)}>
            tick {tick}
          </button>
          <table>
            <tbody>
              <tr>
                <SalarySheetRowCells row={row} hasAdjustment={false} />
              </tr>
            </tbody>
          </table>
        </LanguageProvider>
      );
    }

    render(<Host />);
    const afterFirstPaint = formatSpy.mock.calls.length;
    expect(afterFirstPaint).toBeGreaterThan(0);

    // A parent state change that has nothing to do with the numbers — the
    // reorder toggle and the saving flag are exactly this shape.
    await userEvent.click(screen.getByRole("button", { name: /tick/ }));
    expect(screen.getByRole("button", { name: "tick 1" })).toBeInTheDocument();
    expect(formatSpy.mock.calls.length).toBe(afterFirstPaint);

    formatSpy.mockRestore();
  });

  it("re-renders when the row's numbers actually change", () => {
    const { rerender } = renderCells(buildRow());
    expect(screen.getByText("₹8,100")).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <table>
          <tbody>
            <tr>
              <SalarySheetRowCells
                row={buildRow({ calculatedSalary: 7800 })}
                hasAdjustment={false}
              />
            </tr>
          </tbody>
        </table>
      </LanguageProvider>,
    );
    expect(screen.getByText("₹7,800")).toBeInTheDocument();
  });
});
