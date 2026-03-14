# Design: Packaging Item Groups + Employee Page Revamp

**Date:** 2025-03-14  
**Status:** Design for approval before implementation

---

## 1. Purpose and scope

- **Packaging item groups:** Rename and treat current "items" as groups of items that share one packaging price. No schema change to the store; UI and copy use "Packaging item group" (and settings "Packaging item groups").
- **Employee page revamp:** Full redesign of the employee list and employee detail page with a clear aesthetic direction, accessibility (keyboard, focus, ARIA), and new features: calendar with period selection and attendance/holiday display, plus employee shift and total salary with derived rate per day/hour.

---

## 2. Packaging item groups

- **Terminology:** Every user-facing reference to "item" in the production/salary context becomes "packaging item group" (or "group" where clear). Settings section title: "Packaging item groups". Add form: "Packaging item group name", "Packaging price (rate)".
- **Data:** Existing `items` store unchanged: `{ id, name, rate }`. No migration. Optional: add a `label` or keep `name` as the display name.
- **Code:** Rename service/file only if desired (e.g. `itemService` → `packagingItemGroupService` and alias for backward compatibility), or keep `itemService` and update UI strings and comments. Production form and salary reports show "Packaging item group" instead of "Item".

---

## 3. Employee list and navigation

- **Accessibility:** Employee detail is opened by clicking the row (or a dedicated "View" button). The current link on the name remains; we add either row-level click (with `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space) or an explicit "View" / "Open" button so keyboard and screen-reader users have a clear, single action. Avoid duplicate focus targets (e.g. name link + row click) without clear semantics; prefer one primary control per row (e.g. name link that goes to detail, or whole row as link wrapped in a single focusable element).
- **Revamp (frontend-design):** The list page gets a bold, consistent aesthetic: typography (e.g. heading font), spacing, and a clear hierarchy. Table or card list with employee name, status, assigned shift (name), and primary action (Open/View). No generic card grid; one list/table with clear affordances. Delete stays as a secondary, destructive action (icon button with aria-label).

---

## 4. Employee detail: shift and salary

- **Employee fields (new):**  
  - `shiftId` (string, optional): references a shift from the existing `shifts` store.  
  - `monthlySalary` (number, optional): total salary for the month (used for proration).
- **Shifts:** Already have `name` and `hoursPerDay`. Used for: (1) showing employee’s shift name on list and detail, (2) computing rate per day and rate per hour.
- **Derived rates (for the selected month/period):**  
  - Working days in month = days in that month minus Sundays and minus factory holidays (from the new factory-holidays store).  
  - Rate per day = `monthlySalary / workingDaysInMonth`.  
  - Rate per hour = `monthlySalary / (workingDaysInMonth * shift.hoursPerDay)` (if no shift, show only rate per day or "—").  
  Display these on the employee detail (e.g. in a "Salary & shift" section) for the current or selected month.

---

## 5. Calendar and attendance

- **Placement:** On the employee detail page, a calendar section shows the chosen month. User can select a period (e.g. 1–15 or 16–end, or custom range) and only that period is highlighted; the rest of the month remains visible but de-emphasized.
- **Data per day (aggregated):**  
  - **Present:** Employee has at least one production on that day, or an explicit "present" attendance record.  
  - **Absent:** Explicit "absent" attendance record (no production, or overrides production if we allow both).  
  - **Factory holiday:** That date is in the factory holidays list; applies to all.  
  - **No entry:** If there is no production, no attendance record, and no factory holiday, the day has no indicator (blank or neutral).
- **Stores:**  
  - **Factory holidays:** New store `factory_holidays` with `{ id, date }` (date = YYYY-MM-DD).  
  - **Attendance:** New store `attendance` with `{ id, employeeId, date, status: 'present' | 'absent' }`. Production-based presence can be computed on read (has production that day ⇒ treat as present) unless we also allow explicit "present" for days with no production. Recommendation: treat "has production" as present; store only explicit **absent** (and optional explicit present for non-production days). So attendance store can be minimal: only records when we need to mark absent (or explicit present).  
  Simplest: **factory_holidays** (date only), **attendance** (employeeId, date, status: 'present' | 'absent'). If no attendance record and no production for that day and not a holiday → no entry. If holiday → show "Holiday". If production exists → show "Present". If attendance status absent → show "Absent". If attendance status present → show "Present".
- **Calendar UI:** Month grid; each cell is a day. Optional: tooltip or small label (P / A / H or icon). Selected period (e.g. 15 days) is highlighted (e.g. background or border). Accessible: day cells have aria-label describing date and status; period selector is a control (e.g. dropdown or two date inputs).

---

## 6. Employee detail layout and UX

- **Sections (order):**  
  1. Header: employee name, back to list.  
  2. **Shift & salary:** Shift dropdown (from shifts), monthly salary input, and for the selected month: working days, rate per day, rate per hour (read-only).  
  3. **Calendar:** Month picker, period selector (e.g. 1–15, 16–31, or custom), then the calendar grid with period highlight and day status (present/absent/holiday/none).  
  4. **Salary (15-day periods):** Existing period selector, gross/advance/net, print, save settlement.  
  5. **Stored salary records:** Existing table.  
  6. **Add production:** Form uses "Packaging item group" and shift from shifts (if we move production to use shiftId; otherwise keep day/night for production and use shift only for employee’s default and rate calculation).  
  7. **Add advance:** Unchanged.  
  8. **Production entries / Advances in period:** Unchanged except "Item" → "Packaging item group".
- **Aesthetic (frontend-design):** One clear direction (e.g. industrial/utilitarian or refined minimal). Consistent type scale, spacing, and color; no generic cards-everywhere look. Calendar and period selector feel part of the same system.

---

## 7. Assumptions and open points

- **Working days:** Rate per day/hour use working days = month days − Sundays − factory holidays. No other off days (e.g. optional weekly off) in v1.
- **Production shift vs employee shift:** Production still stores "day" | "night" (or we later switch to shiftId). Employee’s shiftId is for salary rate calculation and display; production shift can stay as-is unless we decide to migrate to shiftId.
- **Attendance:** Only store explicit present/absent when needed; "present" can be inferred from production. So we can start with: factory_holidays store, attendance store (employeeId, date, status), and calendar logic that merges production + attendance + holidays.

---

## 8. Skills and references

- **@frontend-design** for employee list and detail revamp (typography, color, layout, motion, accessibility).  
- **@writing-plans** for the implementation plan (bite-sized tasks, exact files, TDD where applicable).

---

*Once this design is approved, the next step is to produce the implementation plan in `docs/plans/2025-03-14-packaging-groups-employee-revamp.md` and then execute it task-by-task.*
