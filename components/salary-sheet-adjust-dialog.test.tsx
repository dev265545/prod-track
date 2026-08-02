import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/components/language-provider";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";

const { mockSave, mockHolidays, mockAppSettings } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockHolidays: vi.fn(),
  mockAppSettings: vi.fn(),
}));

vi.mock("@/lib/services/salarySheetOverrideService", () => ({
  saveSalarySheetOverride: mockSave,
}));

vi.mock("@/lib/services/factoryHolidayService", () => ({
  getHolidaysInRange: mockHolidays,
}));

vi.mock("@/lib/services/appSettingsService", () => ({
  getAppSettings: mockAppSettings,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SalarySheetAdjustDialog } from "@/components/salary-sheet-adjust-dialog";

/**
 * The app counted 12 present days for the first half of March; somebody has
 * already corrected that to 14. `calculatedValues` is what the app counted and
 * never moves; the top-level fields are what is in force.
 */
function buildCorrectedRow(): SalarySheetRow {
  return {
    id: "emp_1",
    name: "Asha",
    employeeType: "salaried",
    presentDays: 14,
    absentDays: 14,
    holidayPresentDays: 1,
    earnedSundayPayDays: 0,
    sundayPresentBonusDays: 0,
    totalPaidDays: 14,
    monthlySalary: 9300,
    ratePerDay: 300,
    ratePerHour: 37.5,
    hoursExtraTotal: 0,
    hoursReducedTotal: 0,
    baseCalculatedSalary: 3600,
    calculatedSalary: 4200,
    advanceDeduction: 0,
    netCalculatedSalary: 4200,
    hasOverrides: true,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: { presentDays: 14 },
    calculatedValues: {
      presentDays: 12,
      absentDays: 14,
      holidayPresentDays: 1,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 0,
      totalPaidDays: 12,
      hoursExtraTotal: 0,
      hoursReducedTotal: 0,
      calculatedSalary: 3600,
      advanceDeduction: 0,
      netCalculatedSalary: 3600,
    },
    dayPayCap: { limit: 2, clippedDays: 0, clippedDates: 0 },
  };
}

function renderDialog(row: SalarySheetRow) {
  return render(
    <LanguageProvider>
      <SalarySheetAdjustDialog
        open
        onOpenChange={() => {}}
        row={row}
        year={2026}
        month={2}
        periodFrom="2026-03-01"
        periodTo="2026-03-15"
        onSaved={() => {}}
      />
    </LanguageProvider>,
  );
}

function presentDaysBox(): HTMLInputElement {
  return screen.getByLabelText("Present days") as HTMLInputElement;
}

describe("SalarySheetAdjustDialog", () => {
  beforeEach(() => {
    mockSave.mockReset();
    mockSave.mockResolvedValue(undefined);
    mockHolidays.mockReset();
    mockHolidays.mockResolvedValue([]);
    mockAppSettings.mockReset();
    mockAppSettings.mockResolvedValue({ maxDayPayFraction: 2 });
  });

  it("opens with the correction already in force, not the app's count", async () => {
    renderDialog(buildCorrectedRow());
    await waitFor(() => expect(presentDaysBox().value).toBe("14"));
    expect(screen.getByText(/App counted:\s*12/)).toBeInTheDocument();
  });

  it("saves an untouched reopen as the very same correction", async () => {
    const user = userEvent.setup();
    renderDialog(buildCorrectedRow());
    await waitFor(() => expect(presentDaysBox().value).toBe("14"));

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].overrides).toEqual({ presentDays: 14 });
  });

  it("puts the app's own count back when asked to, so a correction can be taken off", async () => {
    const user = userEvent.setup();
    renderDialog(buildCorrectedRow());
    await waitFor(() => expect(presentDaysBox().value).toBe("14"));

    await user.click(
      screen.getAllByRole("button", { name: "Use app's number" })[0],
    );
    await waitFor(() => expect(presentDaysBox().value).toBe("12"));

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].overrides).toEqual({});
  });

  it("clears every correction with the all-fields button", async () => {
    const user = userEvent.setup();
    renderDialog(buildCorrectedRow());
    await waitFor(() => expect(presentDaysBox().value).toBe("14"));

    await user.click(
      screen.getByRole("button", { name: "Use app's numbers for all" }),
    );
    await waitFor(() => expect(presentDaysBox().value).toBe("12"));

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].overrides).toEqual({});
  });

  it("says so when the period limits pull a saved correction down on opening", async () => {
    // Mar 1–15 2026 holds 12 non-Sunday dates, so at most 24 paid days. A
    // stored correction of 40 has to come down — and has to say that it did.
    const row = buildCorrectedRow();
    renderDialog({ ...row, presentDays: 40 });

    await waitFor(() => expect(presentDaysBox().value).toBe("24"));
    expect(
      screen.getByText(/above what this period allows/),
    ).toBeInTheDocument();
  });

  it("keeps a hand-typed zero as zero rather than falling back to the count", async () => {
    const user = userEvent.setup();
    renderDialog(buildCorrectedRow());
    await waitFor(() => expect(presentDaysBox().value).toBe("14"));

    await user.clear(presentDaysBox());
    await user.type(presentDaysBox(), "0");
    await waitFor(() => expect(presentDaysBox().value).toBe("0"));

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].overrides).toEqual({ presentDays: 0 });
  });
});
