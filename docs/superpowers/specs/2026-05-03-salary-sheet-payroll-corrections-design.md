# Salary Sheet Payroll Corrections Design

## Goal

Fix three payroll gaps in the attendance salary flow:

1. Factory-holiday presence must pay the employee for the day instead of counting only toward extra-day logic.
2. Extra-day earning logic must use plain present-date counts, not fractional paid-day totals.
3. Salary-sheet users must be able to permanently override payroll-facing values for any employee and selected in-month range.

## Current Behavior

- `lib/utils/attendanceStats.ts` excludes factory holidays from paid working days and labels a holiday-present day as `Present (holiday — no base pay)`.
- Extra-day calculation uses `computeDayPayFraction()` inside 15-day windows, so partial-hour days can reduce the qualifying count below the threshold even when the employee was present on enough dates.
- `app/salary-sheet/page.tsx` renders calculated values only; there is no persistent override model.

## Approved Product Decisions

### Holiday Pay

- A factory holiday with attendance status `present` should pay exactly like a normal present working day.
- The holiday row remains visually identifiable as a holiday, but it is paid.
- A holiday with no `present` mark remains unpaid and does not count as absent.

### Extra-Day Qualification

- Qualification for cycle-based extra days is based on count of present dates in the cycle.
- Hour shortfall or overtime still affects day pay fraction and salary amount.
- Hour shortfall or overtime must not change whether the employee qualifies for the extra-day threshold.
- Sundays remain a separate bonus path and keep current behavior.

### Manual Overrides

- Overrides are permanent records stored in the DB.
- Overrides are scoped per employee and exact salary-sheet range (`year`, `month`, `fromDate`, `toDate`).
- Full-month, `1-15`, `16-end`, and custom range sheets can each have their own override record.
- The salary sheet remains automatically calculated by default; any overridden field replaces only that field.
- Users can reset one field or the whole override record.

## Data Model

Add a new store: `salary_sheet_overrides`.

Each record stores:

- `id`
- `employeeId`
- `year`
- `month`
- `fromDate`
- `toDate`
- `notes`
- `updatedAt`
- `overrides`

`overrides` contains nullable replacements for payroll-facing fields:

- `presentDays`
- `absentDays`
- `earnedSundayPayDays`
- `sundayPresentBonusDays`
- `holidayPresentDays`
- `hoursExtraTotal`
- `hoursReducedTotal`
- `totalPaidDays`
- `calculatedSalary`

The stored fields are final display/payroll values, not diffs.

## Calculation Changes

### Holiday-Present Pay

- In monthly and range salary calculations, weekday holidays marked `present` contribute:
  - `holidayPresentDays += 1`
  - `presentDays += computeDayPayFraction(...)`
  - base pay equal to `paidFraction * ratePerDay`
- They do not increment `absentDays`.

### Extra-Day Threshold

- The threshold helper must count present working dates in each 15-day cycle.
- A date counts as present if attendance status is `present`, regardless of `hoursWorked`, `hoursReduced`, or `hoursExtra`.
- Factory holidays are excluded from cycle qualification windows just as they are excluded from working-day windows.

### Summary Shape

Extend salary-sheet summary outputs with:

- `holidayPresentDays`
- `baseCalculatedSalary`
- `hasOverrides`
- `overrideNotes`

`calculatedSalary` remains the effective value after overrides are applied for salary-sheet consumers.

## UI Flow

### Salary Sheet

- Add an `Adjust` action on each employee row in `app/salary-sheet/page.tsx`.
- Clicking it opens a modal instead of navigating away.
- The row itself should still allow navigation to the employee page, but the adjust action must stop propagation.

### Adjustment Modal

Show:

- employee name
- selected period label and exact dates
- calculated values
- editable override values
- optional notes
- reset field buttons
- reset all overrides
- save and cancel

Editable values are numeric inputs seeded from current effective values.

### Sheet Rendering

- If a row has overrides, show the overridden numbers in the table.
- A subtle indicator should mark that the row has manual adjustments.
- Printing uses effective values, not raw calculated values.

## Service Layer

Add a dedicated salary-sheet override service with:

- fetch by employee + range
- fetch all overrides for a range
- save override
- clear one field
- clear full record

Salary-sheet row building should:

1. calculate the base summary
2. load matching override record
3. merge override fields onto the calculated row
4. expose override metadata for UI

## Testing

Required coverage:

- holiday-present day is paid in month and range summaries
- holiday-present day is labeled correctly in day breakdown while still paid
- fractional present days do not prevent extra-day qualification when present-date count reaches threshold
- override merge logic replaces only specified fields
- override records round-trip through export/import validation
- salary-sheet range override scoping distinguishes full month vs half-month records

## Files Expected To Change

- `lib/utils/attendanceStats.ts`
- `lib/utils/attendanceStats.test.ts`
- `lib/db/schema.ts`
- `lib/db/indexeddb.ts`
- `lib/db/exportImport.validation.test.ts`
- `src-tauri/src/db.rs`
- `lib/services/salarySheetService.ts`
- new `lib/services/salarySheetOverrideService.ts`
- `app/salary-sheet/page.tsx`
- supporting UI imports/components as needed
