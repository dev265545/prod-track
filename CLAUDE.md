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

**Navigation** (`components/navigation.ts`) — Single source of truth for the
IA. Five role-filtered modules — Attendance, Production, Inventory (operator);
Payroll, Settings (admin) — with a hub landing page (`app/page.tsx`) and a
module-scoped sidebar. Ordering is literal; nothing derives a position from a
href. Breadcrumbs are generated from the same table, so every page gets one
idiom for free. Icons must stay distinct per module AND per page: collapsed,
the rail is icon-only and the operator navigates by shape.

**Onboarding** (`app/onboarding/page.tsx`) — Two steps, fully bilingual. The
storage backend is a build-time decision (`lib/db/adapter.ts`), so it is only
asked in the `sqlite-file` build, phrased as an outcome rather than a
technology. Sets BOTH passwords: a daily-use (worker) password and an owner
password — without the worker one, the operator must sign in as admin and sees
payroll. Import is optional and confirms before overwriting.

**Employee Management** — `app/employees/page.tsx` is **People**, a
joiners/leavers screen: add/delete, shift, Sunday category, sort order,
`isActive`, `monthlySalary`, `employeeType`. `app/employee/page.tsx` (`?id=`)
is the per-person detail; its logic lives in `lib/utils/employeeDetail.ts`
(pure, tested) and its UI in `components/employee/**`.

**Attendance** (`app/attendance/page.tsx`) — The daily roster and the
Attendance module's landing page: pick a date once, one tap per person,
"everyone is here today" fills only unmarked rows. Marks are `present` /
`absent` only; a short day is recorded through hours on a present row, which
`computeDayPayFraction` turns into a fraction of a paid day. Production-type
employees are excluded — they are paid for output, not days.
`lib/utils/attendanceRoster.ts` holds the pure logic.

**Shifts & Sunday rules** (`app/shifts/page.tsx`) — Shift definitions, and the
configurable Sunday rule engine (`lib/utils/sundayRule.ts`). A rule is either
an owner-authored **bracket table** (`whenPresentDaysAtLeast` → `give`) or a
**repeating** rule, plus `cycleDays`, `maxPerCycle`/`maxPerMonth` (`null` =
no limit) and an optional `sundayPremium`. Legacy `threshold`/`step`
categories migrate on read and are never rewritten. Caps are user-visible: the
editor reports when a limit would clip the rule being typed.

**Production** (`app/production/page.tsx`) — The Production module's landing
page and the one place output is recorded. Always via
`productionEntryService.saveProductionEntry`, never raw `saveProduction`: it
writes the pay row AND draws down stock, rolling the pay row back if the
deduction fails. The two stores use different id spaces, so it resolves the
stock row through the legacy item map. `app/items/page.tsx` redirects to
Inventory.

**Inventory** (`app/inventory/**`) — Six categories over two layers: `raw`
(bought and consumed) and `finished` (made and sold); `layer` decides what can
be produced and what carries packing parts. Never say "raw"/"finished" in the
UI — `lib/services/inventoryStockKind.ts` owns the wording ("we buy" / "we
make") and `INVENTORY_CATEGORIES` derives from it. Table is the default view;
global search spans all categories by name and code.

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

**Settings** (`app/settings/page.tsx`, a ~100-line shell over
`components/settings/**`) — Four tabs: General, Production, Calendars, Data.
No `window.confirm`/`prompt` anywhere; restore previews what it will replace
and offers a backup first, and delete-history shows real counts before it
runs. Alert severity is an explicit tone, never string-matched from localised
text. Calendars also holds the factory-wide Sunday premium defaults.

**App settings** (`lib/services/appSettingsService.ts`) — Typed row in
`_metadata`, spec'd in `docs/superpowers/specs/2026-07-29-admin-configuration-design.md`.
Reads safely when absent (every pre-existing install), and rides along in
export/import WITHOUT ever writing the `_app` credential row into a backup.
Holds `productionInventoryLinkEnabled` (whether production draws down stock and
whether its picker shows stock items) and the Sunday premium defaults.

**Audit log** (`lib/services/auditService.ts`, viewer at `app/audit/`) —
Admin-only. `AUDIT_ACTIONS` is a typed catalogue so call sites cannot invent
strings; `diffEntity` takes a field allowlist so internals and credential
fields never reach the screen. Summaries must be human sentences —
`isHumanSummary` rejects `[object Object]` and bare action ids. Wire NEW
mutations at the SERVICE level, not the adapter: the adapter only knows a store
name and a row, so it cannot write the sentence that makes the log usable.
Append-only by convention, not enforcement — say so, don't imply otherwise.

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

## Constraints that are easy to break by accident

**Chrome 109 / Windows 7 is the floor.** No `oklch()`, no `color-mix()`, no CSS
nesting. Tailwind alpha modifiers (`bg-warning/10`) COMPILE to `color-mix()` —
use `bg-surface-1..4` instead. Theme tokens are sRGB hex on purpose so legacy
Chrome gets the designed colours, not a fallback;
`scripts/generate-legacy-opacity-fallbacks.mjs` derives the rest by parsing
`globals.css`. `scripts/preview-legacy-chrome.mjs` builds a copy of `out/` with
the blocks Chrome 109 skips removed, so it can be viewed in a modern browser.

**Both users are non-technical with low literacy.** Icon AND word, never icon
alone. 44px minimum targets. No jargon on screen — not "threshold",
"override", "BOM", "raw/finished", "inward/outward", or a database field name.
Every chart needs a text equivalent.

**No horizontal page scroll at any width from 320px.** `min-w-0` on flex/grid
children; wide tables get their own `overflow-x-auto`.

**en/hi parity is compile-enforced** by `Record<MessageKey, string>` — a missing
Hindi key is a type error, not a silent gap. Add keys additively.

**Number inputs** use `components/ui/number-input.tsx`, never raw
`type="number"`: that accepted letters, reported an empty value for invalid
content, changed on scroll, and was filled by browser autofill.

**Payroll changes need an equivalence test.** The convention here is to keep a
verbatim copy of the previous algorithm in the test file and sweep it — see
`lib/utils/sundayRule.test.ts`.

**Data model** (`lib/db/schema.ts`, schema version 11) — Stores: `audit_log`, `items`,
`employees`, `productions`, `advances`, `advance_deductions`, `shifts`,
`salary_records`, `salary_sheet_overrides`, `factory_holidays`, `attendance`,
`sunday_categories`, `operator_national_holidays`, `machines`, `item_combos`,
`inventory_items`, `inventory_movements`, `_metadata`.
Indexes live in `lib/db/indexes.ts` and are shared by all three backends; read
through `getByIndex` rather than `getAll` + filter, or a factory with two years
of data deserialises the whole store on every query.

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
