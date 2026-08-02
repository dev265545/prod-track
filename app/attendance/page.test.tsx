import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/language-provider";
import { today } from "@/lib/utils/date";

/**
 * The roster is the screen the operator opens every morning, and its three
 * promises are all invisible to the type checker:
 *
 *  1. a tap writes the right record,
 *  2. "everyone is here today" fills only what is blank — it can add work but
 *     never destroy a correction,
 *  3. a failed write puts the row back and says whose it was.
 *
 * (2) and (3) are the ones a screenshot catches and a unit test does not: the
 * pure helpers (`rowsToFillPresent`, `buildAttendancePayload`) are already
 * covered, but nothing checked that the page calls them, in that order, against
 * the rows actually on screen.
 */

const saveAttendance = vi.fn();
const getAllAttendanceByDate = vi.fn();
const getEmployees = vi.fn();
const getShifts = vi.fn();
const getHolidayByDate = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/services/attendanceService", () => ({
  saveAttendance: (...args: unknown[]) => saveAttendance(...args),
  getAllAttendanceByDate: (...args: unknown[]) =>
    getAllAttendanceByDate(...args),
}));
vi.mock("@/lib/services/employeeService", () => ({
  getEmployees: (...args: unknown[]) => getEmployees(...args),
}));
vi.mock("@/lib/services/shiftService", () => ({
  getShifts: (...args: unknown[]) => getShifts(...args),
}));
vi.mock("@/lib/services/factoryHolidayService", () => ({
  getHolidayByDate: (...args: unknown[]) => getHolidayByDate(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

// The guard and the chrome are not what this file is about; both are covered
// elsewhere and both would drag next/navigation and the DB adapter in.
vi.mock("@/lib/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ ready: true, role: "admin" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AttendancePage from "@/app/attendance/page";

const EMPLOYEES = [
  { id: "e1", name: "Asha Devi", isActive: true },
  { id: "e2", name: "Bhim Singh", isActive: true },
  { id: "e3", name: "Chandan Lal", isActive: true },
];

/** The two buttons for one person, found the way a screen reader finds them. */
function personRow(name: string) {
  return within(screen.getByRole("group", { name }));
}

async function renderRoster() {
  render(
    <LanguageProvider>
      <AttendancePage />
    </LanguageProvider>,
  );
  // Wait for the load to land — the skeleton has no rows.
  await screen.findByRole("group", { name: "Asha Devi" });
}

beforeEach(() => {
  vi.clearAllMocks();
  getEmployees.mockResolvedValue(EMPLOYEES);
  getShifts.mockResolvedValue([]);
  getAllAttendanceByDate.mockResolvedValue([]);
  getHolidayByDate.mockResolvedValue(null);
  saveAttendance.mockImplementation(async (record: { employeeId: string }) => ({
    ...record,
    id: `att-${record.employeeId}`,
  }));
});

describe("attendance roster", () => {
  it("writes a present record for the person whose button was tapped", async () => {
    const user = userEvent.setup();
    await renderRoster();

    const here = personRow("Asha Devi").getByRole("button", {
      name: "Here today",
    });
    expect(here).toHaveAttribute("aria-pressed", "false");

    await user.click(here);

    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
    expect(saveAttendance).toHaveBeenCalledWith({
      employeeId: "e1",
      date: today(),
      status: "present",
    });
    // The pressed state is the only thing that tells a non-sighted operator
    // which answer was recorded — colour alone was the bug this replaced.
    await waitFor(() =>
      expect(here).toHaveAttribute("aria-pressed", "true"),
    );
    expect(
      personRow("Asha Devi").getByRole("button", { name: "Not here" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("writes an absent record with no hours attached", async () => {
    const user = userEvent.setup();
    await renderRoster();

    await user.click(
      personRow("Bhim Singh").getByRole("button", { name: "Not here" }),
    );

    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
    expect(saveAttendance).toHaveBeenCalledWith({
      employeeId: "e2",
      date: today(),
      status: "absent",
    });
  });

  it("'everyone is here' fills only unmarked rows and never overwrites a correction", async () => {
    const user = userEvent.setup();
    await renderRoster();

    // The operator's correction: Bhim is away today.
    await user.click(
      personRow("Bhim Singh").getByRole("button", { name: "Not here" }),
    );
    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
    saveAttendance.mockClear();

    // The bulk button re-labels itself to the count it will actually touch.
    await user.click(
      screen.getByRole("button", { name: "Mark the other 2 as here today" }),
    );

    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(2));
    const touched = saveAttendance.mock.calls.map((c) => c[0].employeeId);
    expect(touched.sort()).toEqual(["e1", "e3"]);
    // Not one write for Bhim, and his answer is still on screen.
    expect(touched).not.toContain("e2");
    expect(
      personRow("Bhim Singh").getByRole("button", { name: "Not here" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      personRow("Bhim Singh").getByRole("button", { name: "Here today" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reverts the row and names the person when the save fails", async () => {
    const user = userEvent.setup();
    await renderRoster();

    saveAttendance.mockRejectedValueOnce(new Error("disk full"));

    const here = personRow("Chandan Lal").getByRole("button", {
      name: "Here today",
    });
    await user.click(here);

    // Back to unwritten: nothing on screen the database disagrees with.
    await waitFor(() =>
      expect(here).toHaveAttribute("aria-pressed", "false"),
    );
    // All three are unwritten again, so the rollback restored the row rather
    // than just un-pressing the button.
    expect(screen.getAllByText("Not written yet")).toHaveLength(3);
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("Chandan Lal"),
    );
  });
});
