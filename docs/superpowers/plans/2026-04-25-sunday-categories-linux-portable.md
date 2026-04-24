# Sunday Categories + Linux Portable Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-employee Sunday earning categories (like shift selection) with 15-day cap enforcement, and add Linux `.sh` portable launcher support in release artifacts.

**Architecture:** Introduce a new DB store and service for Sunday categories, attach category id to each employee, and thread category-aware earning logic through attendance/salary calculations. Add a Linux launcher script into `portable/` so the existing release ZIP works on Ubuntu/Linux too.

**Tech Stack:** Next.js + TypeScript, shared DB adapter (IndexedDB/sqlite/Tauri), Vitest, GitHub Actions.

---

### Task 1: Category earning logic (TDD)

**Files:**
- Modify: `lib/utils/attendanceStats.test.ts`
- Modify: `lib/utils/attendanceStats.ts`

- [ ] Add failing tests for threshold and step categories with per-15-day cap of 2.
- [ ] Run `npm test -- lib/utils/attendanceStats.test.ts` and confirm failures.
- [ ] Implement `SundayCategoryRule` + category-aware earned-day computation.
- [ ] Re-run same test file until green.

### Task 2: Persist category config + employee binding

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `src-tauri/src/db.rs`
- Create: `lib/services/sundayCategoryService.ts`
- Modify: `lib/services/salaryService.ts`
- Modify: `lib/services/salarySheetService.ts`
- Modify: `app/employee/EmployeePageClient.tsx`
- Modify: `app/employees/page.tsx`

- [ ] Add new store constant/table for Sunday categories.
- [ ] Add CRUD service for Sunday categories.
- [ ] Wire employee `sundayCategoryId` selection in employee detail page, similar to shift.
- [ ] Load and show Sunday category in employees list.
- [ ] Feed selected/default category into all attendance/salary calculations.

### Task 3: Sunday categories management UI

**Files:**
- Modify: `app/shifts/page.tsx`

- [ ] Add second card/section on Shifts page for Sunday categories list + add/delete.
- [ ] Add fields for `threshold` mode and `step` mode.
- [ ] Add sane defaults and inline labels matching requested examples.

### Task 4: Linux portable launcher + release docs

**Files:**
- Create: `portable/Start-ProdTrack.sh`
- Modify: `portable/README.txt`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`

- [ ] Add executable `.sh` launcher that serves `portable/web` and opens browser via `xdg-open`.
- [ ] Ensure CI marks shell script executable before zipping.
- [ ] Update readme/release text to mention Windows + Linux launchers.

### Task 5: Verification

**Files:**
- No source changes expected

- [ ] Run targeted tests: `npm test -- lib/utils/attendanceStats.test.ts`.
- [ ] Run full suite: `npm test`.
- [ ] Run lint if available and report any blockers.
- [ ] Summarize changed files and remaining risks.
