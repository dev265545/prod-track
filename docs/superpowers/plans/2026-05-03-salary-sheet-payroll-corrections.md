# Salary Sheet Payroll Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix holiday-present pay, change extra-day qualification to present-date counting, and add permanent salary-sheet overrides per employee and selected in-month range.

**Architecture:** Keep attendance calculation as the source of automatic truth, add a persistent override store layered on top of calculated salary-sheet rows, and edit those overrides from a row-level modal in the salary sheet. Calculation logic changes stay in `attendanceStats`, while override persistence and row merging live in services.

**Tech Stack:** Next.js app router, TypeScript, IndexedDB/Tauri SQLite JSON-row storage, Vitest, Radix dialog UI

---

### Task 1: Lock the changed payroll rules with failing calculation tests

**Files:**
- Modify: `lib/utils/attendanceStats.test.ts`

- [ ] **Step 1: Write failing tests for holiday-present pay and present-count qualification**

```ts
it("pays a factory-holiday present day in range summary", () => {
  const summary = buildAttendanceSalarySummaryForRange({
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    holidayDates: ["2026-04-02"],
    attendance: [{ date: "2026-04-02", status: "present" }],
    hoursPerDay: 8,
    ratePerDay: 1000,
  });
  expect(summary.presentDays).toBe(1);
  expect(summary.holidayPresentDays).toBe(1);
  expect(summary.calculatedSalary).toBe(1000);
});

it("qualifies a 15-day cycle by present dates even when one day is fractional", () => {
  const att = new Map([
    ["2026-04-01", { status: "present" as const, hoursReduced: 1 }],
    ["2026-04-02", { status: "present" as const }],
  ]);
  // plus remaining required present dates in the same cycle...
  expect(
    computeEarnedExtraPayDaysForCalendarScope(
      "2026-04-01",
      "2026-04-15",
      [],
      att,
      8,
    ),
  ).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/utils/attendanceStats.test.ts`
Expected: FAIL because holiday-present rows still pay `0` and cycle qualification still uses fractional values.

### Task 2: Implement calculation updates in attendance stats

**Files:**
- Modify: `lib/utils/attendanceStats.ts`
- Test: `lib/utils/attendanceStats.test.ts`

- [ ] **Step 1: Replace cycle qualification helper with present-date counting**

```ts
function countPresentDaysOnWorkingDaysInMonthWindow(...) {
  let count = 0;
  ...
  if (att?.status === "present") count += 1;
  return count;
}
```

- [ ] **Step 2: Pay holiday-present days and expose holiday present count**

```ts
if (holidaySet.has(dateStr)) {
  const att = attByDate.get(dateStr);
  if (att?.status === "present") {
    const frac = computeDayPayFraction(att, hoursPerDay);
    paidWorkingDays += frac;
    holidayPresentDays += 1;
    ...
    basePay: Math.round(frac * ratePerDay * 100) / 100,
  }
}
```

- [ ] **Step 3: Extend summary types**

```ts
export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  holidayPresentDays: number;
  ...
}
```

- [ ] **Step 4: Run tests to verify calculation layer passes**

Run: `npx vitest run lib/utils/attendanceStats.test.ts`
Expected: PASS

### Task 3: Add persistent salary-sheet override storage

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/indexeddb.ts`
- Modify: `lib/db/exportImport.validation.test.ts`
- Modify: `src-tauri/src/db.rs`
- Create: `lib/services/salarySheetOverrideService.ts`

- [ ] **Step 1: Add the new store to shared schema**

```ts
export const DB_VERSION = 7;

export const STORES = {
  ...
  SALARY_SHEET_OVERRIDES: "salary_sheet_overrides",
} as const;
```

- [ ] **Step 2: Create the store in IndexedDB and Tauri table lists**

```ts
if (!db.objectStoreNames.contains(STORES.SALARY_SHEET_OVERRIDES)) {
  db.createObjectStore(STORES.SALARY_SHEET_OVERRIDES, { keyPath: "id" });
}
```

```rs
const CURRENT_SCHEMA_VERSION: u32 = 7;
...
"salary_sheet_overrides",
```

- [ ] **Step 3: Add an override service with range-scoped record helpers**

```ts
export interface SalarySheetOverrideRecord {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  fromDate: string;
  toDate: string;
  notes?: string;
  updatedAt: string;
  overrides: Partial<SalarySheetOverrideValues>;
}
```

- [ ] **Step 4: Expand export validation fixture stores**

Run: `npx vitest run lib/db/exportImport.validation.test.ts`
Expected: PASS

### Task 4: Merge overrides into salary-sheet rows with tests

**Files:**
- Modify: `lib/services/salarySheetService.ts`
- Create or Modify: `lib/services/salaryService.test.ts`

- [ ] **Step 1: Add merge helpers and row metadata**

```ts
export interface SalarySheetRow {
  ...
  holidayPresentDays: number;
  hasOverrides: boolean;
  overrideNotes: string;
  baseCalculatedSalary: number;
}
```

- [ ] **Step 2: Load range overrides and merge field-by-field**

```ts
const overridesByEmployeeId = new Map(
  overrideRows.map((row) => [row.employeeId, row]),
);
...
const effectiveRow = applySalarySheetOverrides(baseRow, overrideRecord);
```

- [ ] **Step 3: Add tests for partial override merges and range scoping**

Run: `npx vitest run lib/services/salaryService.test.ts`
Expected: PASS

### Task 5: Add salary-sheet correction modal and save/reset behavior

**Files:**
- Modify: `app/salary-sheet/page.tsx`
- Possibly Modify: `components/ui/input.tsx`
- Possibly Modify: `components/ui/dialog.tsx`

- [ ] **Step 1: Add row-level adjust action and modal state**

```tsx
const [editingRow, setEditingRow] = useState<SalarySheetRow | null>(null);
const [draft, setDraft] = useState<SalarySheetOverrideFormState | null>(null);
```

- [ ] **Step 2: Render modal with calculated vs editable values**

```tsx
<Dialog open={!!editingRow} onOpenChange={...}>
  <DialogContent className="max-w-3xl">
    ...
  </DialogContent>
</Dialog>
```

- [ ] **Step 3: Save override record and reload the sheet**

```tsx
await saveSalarySheetOverride({
  employeeId: editingRow.id,
  year,
  month,
  fromDate: from,
  toDate: to,
  overrides: ...
});
await load();
```

- [ ] **Step 4: Add reset-field and reset-all actions**

Run: `npx vitest run lib/utils/attendanceStats.test.ts lib/db/exportImport.validation.test.ts lib/services/salaryService.test.ts`
Expected: PASS

### Task 6: Verify integrated behavior and prepare branch for push

**Files:**
- Modify: any files required by fixes found during verification

- [ ] **Step 1: Run the targeted test suite**

Run: `npx vitest run lib/utils/attendanceStats.test.ts lib/db/exportImport.validation.test.ts lib/services/salaryService.test.ts`
Expected: PASS

- [ ] **Step 2: Run the broader project test suite if practical**

Run: `npm test -- --runInBand`
Expected: PASS or a clearly documented unrelated failure

- [ ] **Step 3: Review diff and commit**

```bash
git status --short
git add docs/superpowers/specs/2026-05-03-salary-sheet-payroll-corrections-design.md docs/superpowers/plans/2026-05-03-salary-sheet-payroll-corrections.md lib/utils/attendanceStats.ts lib/utils/attendanceStats.test.ts lib/db/schema.ts lib/db/indexeddb.ts lib/db/exportImport.validation.test.ts src-tauri/src/db.rs lib/services/salarySheetOverrideService.ts lib/services/salarySheetService.ts app/salary-sheet/page.tsx
git commit -m "feat: add salary sheet payroll corrections"
```

- [ ] **Step 4: Switch GitHub auth, push main, switch back**

Run: `gh auth switch -u dev265545`
Run: `git push origin main`
Run: `gh auth switch -u devgupta26`
Expected: push succeeds and local auth is restored
