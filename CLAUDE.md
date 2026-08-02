# ProdTrack Lite — Project Reference

Local-first factory workforce, attendance, production, and payroll tracker.
Ships as a static web export (portable bundle, `portable/Start-ProdTrack.sh` /
`.cmd`) or a Tauri desktop app. No backend server — all data lives in
IndexedDB (browser) or a local SQLite file (Tauri / sqlite-file web build).
See `README.md` for build/architecture details; this file tracks *features*.

## Feature inventory

**Auth** (`lib/auth.ts`) — Single shared app password per role (admin /
worker; no user accounts), stored in the `_app` row of the `_metadata` DB
store as a PBKDF2-SHA256 record (`{algo, salt, iterations, hash}`, 200k
iterations, per-install 16-byte random salt). Legacy unsalted SHA-256 hashes
still verify and are silently re-hashed to PBKDF2 on the next successful
login. Minimum password length 6, enforced in `setAppPassword`.
There is **no default password and no master/backdoor password**: an install
with no stored hash goes to onboarding, and a forgotten password is recovered
only by restoring a backup. Destructive Settings actions (change password,
delete all data) require re-entering the *current* admin password.
Session = `localStorage` timestamp with a 5-hour absolute cap, a 30-minute
idle timeout refreshed on activity, plus a `sessionNonce` on the `_app` row
that `setAppPassword` rotates so a password change signs everyone out.
`app/login/page.tsx` prompts for the password; `app/page.tsx` and
`lib/hooks/useAuthGuard.ts` gate authenticated pages.
Caveat: these are client-side controls only — the session marker is a
localStorage value and the data layer enforces nothing.

**Audit log** (`lib/services/auditService.ts`) — Append-only `audit_log`
store; `record(action, entity, entityId, summary, diff?)` stamps role +
timestamp (and a reserved `userId`, null until real accounts exist). Wired
into login success/failure, logout, password change, data import/export and
`clearAllData()`. `clearAllData()` deliberately skips `audit_log` and
`_metadata`.

**Onboarding** (`app/onboarding/page.tsx`) — First-run wizard: pick
SQLite-file vs IndexedDB storage (Tauri only), set the app password,
optionally import an existing backup, then redirect to login.

**Employee Management** — `app/employees/page.tsx`: list/add/delete
employees, assign a shift + "Sunday category" per employee, drag-orderable
sort order, `isActive` flag, `monthlySalary`. `app/employee/page.tsx`
(`?id=`): single employee detail — profile, monthly salary, per-day
attendance calendar, advances, salary/adjustment editing.

**Attendance/Shifts** (`app/shifts/page.tsx`) — Manage Shift definitions
(name, timing) and Sunday Categories: rules for how present-Sunday "earned"
days are computed — `"threshold"` mode (X present days → Y earned Sundays)
or `"step"` mode (every N present days earns a fraction).
`attendanceService.ts` stores per-employee/date attendance
(present/absent/hours-extra/hours-reduced).

**Production/Items** (`app/items/page.tsx`) — CRUD for produced Items
(name + rate). `productionService.ts` records day/night production
quantities per item/employee/date, feeding piece-rate bonuses and reports.

**Salary/Payroll** (core computed feature) —
- `salaryService.ts`: combines production, advances, deductions, items,
  employee, holidays, attendance, and Sunday-category rules into a salary
  result for a period (daily wage, rate/hour, working days, earned Sundays).
- `salarySheetService.ts`: builds a full payroll sheet for all employees
  over a month/date range.
- `salarySheetOverrideService.ts`: manual overrides of computed driver
  values (present days, holiday days, extra/reduced hours) per
  employee/month, for corrections.
- `salarySheetComposite.ts`: merges computed rows with saved overrides into
  the "effective" row.
- `salarySheetEditorState.ts`: draft edit state for the sheet UI.
- `salaryRecordService.ts`: persists finalized/printed salary records as an
  audit trail (empName, designation, month, shift, breakdown fields).
- `app/salary-sheet/page.tsx`: main payroll UI — month-range picker,
  sortable employee table, override editing, export, print.

**Advances** — `advanceService.ts`: employee cash advances (with
delete-before-date cleanup used by Settings' retention tool).
`advanceDeductionService.ts`: tracks per-period deduction of an advance,
feeding salary calculations.

**Holidays** — `factoryHolidayService.ts`: factory-wide holiday dates, used
by attendance/salary calculations and reports.

**Reports** (`app/reports/page.tsx`) — Cumulative production report per
item, by period (day/night/both scope), with print output.

**Settings** (`app/settings/page.tsx`) — Manage factory holidays; change
app password (requires master password); export/import the whole DB as
JSON or SQLite file; purge old productions/advances before a date.

**Data/Backup** (`lib/db/exportImport.ts`) — Full JSON export/import of all
stores with version + schema-version validation; auto-import-from-bundled-file
path for pre-seeded deployments (`data/prodtrack-export.json`).
`sqliteBrowser.ts` supports SQLite-file export/import. `clearAllData()`
wipes everything.

**Print** (`lib/utils/print.ts`) — Unified print helper: Tauri uses a
native printer plugin if detected, else opens HTML in the system browser;
web opens a new window and calls `window.print()`. Used by Reports and
Salary Sheet.

**i18n** (`lib/i18n/`) — English (`en`) and Hindi (`hi`) locales, persisted
in `localStorage`, driven by `useLanguage()` / `t()`.

**Data model** (`lib/db/schema.ts`, schema version 10) — Stores: `audit_log`, `items`,
`employees`, `productions`, `advances`, `advance_deductions`, `shifts`,
`salary_records`, `salary_sheet_overrides`, `factory_holidays`,
`attendance`, `sunday_categories`, `_metadata`.

## Coding Guidelines

See [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) for the full set of rules
covering: read before you write, think before you code, simplicity,
surgical changes, verification, goal-driven execution, debugging,
dependencies, communication, and common failure modes.

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
