# Packaging Item Groups + Employee Page Revamp — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Rename "items" to "packaging item groups" across the app; (2) Add factory holidays and attendance stores and services; (3) Add employee shift + monthly salary and derived rate per day/hour; (4) Revamp employee list and detail page with frontend-design, accessible navigation, and a calendar showing month + selectable period with present/absent/holiday (no entry when nothing).

**Architecture:** Data layer first (schema, services), then UI renames (packaging groups), then employee list revamp and detail page sections (shift/salary, calendar, attendance). Use existing shadcn/ui and design tokens; calendar can be a custom grid or a small library (e.g. date-fns for logic only). Follow @frontend-design for aesthetic and accessibility.

**Tech Stack:** Next.js 14, Tailwind CSS, shadcn/ui, IndexedDB (existing adapter), date-fns or existing date utils.

**Skills to reference:** @frontend-design, @writing-plans

---

## Phase 1: Schema and data layer

### Task 1: Add factory_holidays and attendance stores to schema and DB

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/indexeddb.ts` (create object stores)
- Modify: `lib/db/tauriDb.ts` (if Tauri path creates stores; else skip)
- Modify: `lib/db/exportImport.ts` (include new stores in export/import)

**Step 1:** In `lib/db/schema.ts`, bump `DB_VERSION` to 4 and add to `STORES`:
```ts
export const DB_VERSION = 4;
export const STORES = {
  // ...existing...
  FACTORY_HOLIDAYS: "factory_holidays",
  ATTENDANCE: "attendance",
} as const;
```

**Step 2:** In `lib/db/indexeddb.ts`, in the upgrade callback (version 4), create two new object stores:
```ts
if (db.objectStoreNames.contains(STORES.FACTORY_HOLIDAYS) === false) {
  db.createObjectStore(STORES.FACTORY_HOLIDAYS, { keyPath: "id" });
}
if (db.objectStoreNames.contains(STORES.ATTENDANCE) === false) {
  db.createObjectStore(STORES.ATTENDANCE, { keyPath: "id" });
}
```

**Step 3:** Update `lib/db/exportImport.ts` so that the list of store names used for export/import includes `STORES.FACTORY_HOLIDAYS` and `STORES.ATTENDANCE`.

**Step 4:** Run app, trigger DB open (e.g. login); verify in DevTools Application → IndexedDB that new stores exist. No test file required for DB upgrade.

**Step 5:** Commit with message: `chore(db): add factory_holidays and attendance stores`

---

### Task 2: Create factoryHolidayService

**Files:**
- Create: `lib/services/factoryHolidayService.ts`
- Test: `lib/services/__tests__/factoryHolidayService.test.ts` (optional; if no test, skip Step 1/2/4 and only implement + manual verify)

**Step 1 (optional):** Add a simple test that expects `getAll()` to return array, then `saveHoliday({ date: '2025-01-26' })` and `getByDate('2025-01-26')` to return the record.

**Step 2 (optional):** Run test; expect fail (module not found).

**Step 3:** Implement `lib/services/factoryHolidayService.ts`:
- `getAll()`, `getByDate(date: string)`, `saveHoliday({ id?, date })`, `deleteHoliday(id)`.
- Use `STORES.FACTORY_HOLIDAYS`; id generation `"hol_" + Date.now() + "_" + random suffix`.

**Step 4 (optional):** Run test; expect pass.

**Step 5:** Commit: `feat(services): add factoryHolidayService`

---

### Task 3: Create attendanceService

**Files:**
- Create: `lib/services/attendanceService.ts`

**Step 1:** Implement:
- `getByEmployeeAndDate(employeeId, date)`, `getByEmployeeInRange(employeeId, from, to)`, `getAllByDate(date)` (for factory-wide view if needed later).
- `saveAttendance({ id?, employeeId, date, status: 'present' | 'absent' })`, `deleteAttendance(id)`.
- Store: `STORES.ATTENDANCE`; id: `"att_" + ...`.

**Step 2:** Manual verify: call from browser console or a temporary UI that save/fetch works.

**Step 3:** Commit: `feat(services): add attendanceService`

---

### Task 4: Extend employee model and service for shiftId and monthlySalary

**Files:**
- Modify: `lib/services/employeeService.ts` (no schema change; employees are keyPath "id", add fields at write time)
- Modify: `app/employee/[id]/EmployeePageClient.tsx` (later task will use these; this task only ensures save/load supports new fields)

**Step 1:** In `lib/services/employeeService.ts`, ensure `saveEmployee` does not strip unknown keys. When saving, allow `shiftId` (string) and `monthlySalary` (number). No migration; existing employees simply lack these until set.

**Step 2:** Commit: `feat(employees): support shiftId and monthlySalary on employee`

---

## Phase 2: Packaging item groups (UI rename)

### Task 5: Rename "Items" to "Packaging item groups" in Settings

**Files:**
- Modify: `app/settings/page.tsx`

**Step 1:** Replace all user-facing strings: section title "Items" → "Packaging item groups"; "Item name" → "Packaging item group name"; "Rate" → "Packaging price" or keep "Rate"; table header "Name" can stay or become "Packaging item group"; "Add item" → "Add packaging item group"; delete confirm "Delete this item?" → "Delete this packaging item group?". Keep variable names (e.g. `items`, `itemName`) in code.

**Step 2:** Verify Settings page shows new labels. Commit: `refactor(ui): rename items to packaging item groups in Settings`

---

### Task 6: Rename "Item" to "Packaging item group" on employee detail and reports

**Files:**
- Modify: `app/employee/[id]/EmployeePageClient.tsx`
- Modify: `app/reports/page.tsx` (if it has "Item" column or label)

**Step 1:** In EmployeePageClient: form label "Item" → "Packaging item group"; table header "Item" → "Packaging item group". In reports: any "Item" column header or label → "Packaging item group".

**Step 2:** Commit: `refactor(ui): packaging item group label on employee and reports`

---

## Phase 3: Employee list revamp (design + accessibility)

### Task 7: Employee list — accessible row navigation and visual revamp

**Files:**
- Modify: `app/employees/page.tsx`

**Step 1:** Decide navigation pattern: either (A) make the whole row a single link (wrap row in Link and style as clickable row, move delete to a separate button that stops propagation), or (B) keep name as Link and add a visible "View" / "Open" button for clarity. Recommendation: (A) — use Next.js Link on the row (or first cell spanning name+status), so one click/keyboard focus opens detail; delete button with `e.preventDefault(); e.stopPropagation()` so it doesn’t navigate. Ensure focus management and aria-label on the link (e.g. "View details for {name}").

**Step 2:** Apply frontend-design: pick one clear direction (e.g. industrial/utilitarian). Adjust heading typography, table spacing, and primary/secondary button hierarchy. Ensure table has proper thead/tbody, th scope, and that "Delete" button has aria-label. Optional: show assigned shift name in a new column (load shifts and employee.shiftId; resolve name).

**Step 3:** Verify keyboard: Tab to row link, Enter opens detail; Tab to Delete, Enter triggers delete. Commit: `feat(employees): revamp list with accessible navigation and design`

---

## Phase 4: Employee detail — shift, salary, and calendar

### Task 8: Employee detail — Shift & Salary section

**Files:**
- Modify: `app/employee/[id]/EmployeePageClient.tsx`
- Modify: `lib/services/salaryService.ts` or create `lib/utils/salaryRates.ts` (helper for rate per day/hour)

**Step 1:** Add a "Shift & salary" card/section at the top (after header): dropdown of shifts from `getShifts()`, bound to `employee.shiftId`; number input for monthly salary bound to `employee.monthlySalary`. On save, call `saveEmployee({ ...employee, shiftId, monthlySalary })`.

**Step 2:** Add a small helper (e.g. in `lib/utils/salaryRates.ts`): `getWorkingDaysInMonth(year, month, factoryHolidayDates: string[])` — count weekdays (exclude Sundays) and subtract dates in factoryHolidayDates. Export `getRatePerDay(monthlySalary, workingDays)` and `getRatePerHour(monthlySalary, workingDays, hoursPerDay)`.

**Step 3:** For the current (or selected) month, load factory holidays for that month, compute working days, then display: "Working days: N", "Rate per day: ₹X", "Rate per hour: ₹Y" (if shift has hoursPerDay). Use employee’s monthlySalary and shift from store.

**Step 4:** Verify: set shift and salary, change month if you add a month selector, and confirm numbers. Commit: `feat(employee): add shift and monthly salary with rate per day/hour`

---

### Task 9: Factory holidays and attendance — settings or minimal UI

**Files:**
- Create or modify: `app/settings/page.tsx` (add "Factory holidays" section) or a small inline UI on employee page for testing.

**Step 1:** Add a "Factory holidays" section in Settings: list dates, add date (date picker), delete. Use `factoryHolidayService`. Table or list of dates with delete button.

**Step 2:** Optionally add "Attendance" management: either per-employee on employee page (see Task 10) or a simple list in Settings for a selected date (list employees and set present/absent). Recommendation: keep attendance entry on the employee detail page (Task 10) and only add factory holidays in Settings here.

**Step 3:** Commit: `feat(settings): add factory holidays section`

---

### Task 10: Employee detail — Calendar with period selection and day status

**Files:**
- Modify: `app/employee/[id]/EmployeePageClient.tsx`
- Create (optional): `components/employee-calendar.tsx` (or inline in page)

**Step 1:** Add state: calendar month (e.g. current month), period selection (e.g. "1–15" vs "16–end" or custom from/to). Use existing `getPeriodForDate` / period utilities for 15-day periods.

**Step 2:** Build a month grid (7 columns for weekdays, rows for weeks). For each day in the month: (a) check if date is in factory_holidays → show "Holiday"; (b) else check attendance for this employee and date → show "Present" or "Absent"; (c) else if employee has any production on that date → show "Present"; (d) else no entry (blank or neutral). Use `getProductionsByEmployee(id, monthStart, monthEnd)`, `getByEmployeeInRange` for attendance, `factoryHolidayService` for month’s holidays.

**Step 3:** Highlight the selected period (e.g. 1–15 or 16–31): apply a distinct class to cells in range so the period is visually clear. Period selector: dropdown or tabs "1–15" / "16–31" (and optional "Full month").

**Step 4:** Accessibility: each day cell has `aria-label` (e.g. "15 March, Present"); period selector is focusable and labeled. Ensure color is not the only indicator (icon or text P/A/H).

**Step 5:** Optional: allow marking a day as present/absent from the calendar (e.g. click day → small popover or inline toggle). If implemented, call `attendanceService.saveAttendance`.

**Step 6:** Commit: `feat(employee): add calendar with period highlight and present/absent/holiday`

---

### Task 11: Employee detail — Production form use shifts from store

**Files:**
- Modify: `app/employee/[id]/EmployeePageClient.tsx`

**Step 1:** Production form currently uses hardcoded "day" | "night". Option A: keep as-is. Option B: populate shift dropdown from `getShifts()` and save production with `shiftId` or a string that matches shift name. If productions currently store `shift: "day" | "night"`, keep that for backward compatibility; only change labels to use shift names from store when displaying. Recommendation: keep production shift as day/night for now; only employee’s assigned shift (shiftId) is used for rate calculation. So this task is optional: just ensure production form still works and displays "Packaging item group". If you already have shift dropdown elsewhere, align labels. Otherwise skip or minimal change.

**Step 2:** Commit: `chore(employee): align production form with packaging groups and shifts` (or omit if no code change)

---

### Task 12: Polish and frontend-design pass on employee detail

**Files:**
- Modify: `app/employee/[id]/EmployeePageClient.tsx`
- Modify: `app/globals.css` (if needed for calendar or tokens)

**Step 1:** Apply frontend-design consistently: one aesthetic (e.g. industrial), consistent spacing and typography, no redundant cards. Ensure "Shift & salary", "Calendar", "Salary (15-day periods)", "Add production", "Add advance", and tables follow the same visual language. Check contrast and focus states.

**Step 2:** Verify responsive: calendar and tables readable on small screens (horizontal scroll or stacked if needed).

**Step 3:** Commit: `polish(employee): frontend-design pass on detail page`

---

## Execution handoff

Plan complete and saved to `docs/plans/2025-03-14-packaging-groups-employee-revamp.md`.

**Two execution options:**

1. **Subagent-driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel session (separate)** — Open a new session with executing-plans and run in a dedicated worktree with checkpoints.

Which approach do you prefer?

If **subagent-driven** is chosen, the required sub-skill is **superpowers:subagent-driven-development**.  
If **parallel session** is chosen, use **superpowers:executing-plans** in the new session and work in the worktree created for this feature.
