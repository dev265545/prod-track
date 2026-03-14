# Database & persistence audit

Audit date: 2025-03-15. Goal: ensure all persistence uses SQL/DB and the DB is stored in Tauri app data.

---

## 1. DB location (Tauri app data)

**Status: Correct**

- **Where:** `src-tauri/src/lib.rs` in `setup()`.
- **Path:** `app.path().app_data_dir().join("prodtrack.db")`.
- **Meaning:** DB file is `prodtrack.db` inside Tauri’s app data directory (e.g. Windows: `%APPDATA%\com.tauri.dev\`, from `tauri.conf.json` identifier `com.tauri.dev`).
- **Behavior:** `create_dir_all(&app_data)` ensures the directory exists before opening the DB.

No change needed; a short comment was added in `lib.rs` documenting the location.

---

## 2. Backend: Rust SQLite

**File:** `src-tauri/src/db.rs`

- **Tables (must match frontend schema):**  
  `items`, `employees`, `productions`, `advances`, `advance_deductions`, `shifts`, `salary_records`, `factory_holidays`, `attendance`.
- **Commands:**  
  `init_db`, `db_path`, `db_get_all`, `db_get`, `db_put`, `db_remove`, `db_clear`, `db_export`, `db_import`, `db_export_with_dialog`, `db_import_with_dialog`, `write_temp_html`.
- **Schema:** Each table is `(id TEXT PRIMARY KEY, data TEXT)` with JSON in `data`.

Frontend schema: `lib/db/schema.ts` — `STORES` matches these table names. A comment was added in `db.rs` and `schema.ts` to keep them in sync.

---

## 3. Frontend → DB: adapter and Tauri

**Flow when running inside Tauri:**

1. **Adapter:** `lib/db/adapter.ts` — `isTauri()` → use `tauriDb`, else IndexedDB.
2. **Tauri backend:** `lib/db/tauriDb.ts` — all access via `invoke(...)` to the Rust commands above.
3. **No bypass:** All reads/writes go through `getAll`, `get`, `put`, `remove`, `clear`, `deleteWhere` from the adapter, so in Tauri they hit SQLite.

**Checked:**

- Every service imports from `@/lib/db/adapter` (not directly from `tauriDb` or `indexeddb`).
- No persistence to `localStorage` for business data; `lib/auth.ts` uses `localStorage` only for password hash and session (login state), which is intentional.

---

## 4. Service-by-service

| Service | Store | Reads | Writes | Notes |
|--------|--------|--------|--------|--------|
| `employeeService` | employees | getAll, get | put, remove | OK |
| `itemService` | items | getAll, get | put, remove | OK |
| `productionService` | productions | getAll, get + filter | put, remove, deleteWhere | OK |
| `attendanceService` | attendance | getAll + filter | put, remove | OK |
| `advanceService` | advances | getAll, get + filter | put, remove, deleteWhere | OK |
| `advanceDeductionService` | advance_deductions | getAll + filter | put | OK |
| `shiftService` | shifts | getAll, get | put, remove | OK |
| `salaryRecordService` | salary_records | getAll + filter | put | OK |
| `factoryHolidayService` | factory_holidays | getAll + filter | put, remove | OK |
| `salaryService` | — | Uses production/advance/employee/item/deduction | No direct store | Calculation only, OK |
| `salarySheetService` | — | Uses employees, attendance, holidays, productions, shifts | No direct store | Aggregation only, OK |

All persistence goes through the adapter → in Tauri, SQLite.

---

## 5. Pages and openDB

- **Home:** `app/page.tsx` — calls `openDB()` then renders Dashboard. Dashboard loads data via services (adapter). OK.
- **Reports:** `app/reports/page.tsx` — `openDB()` then loads productions/items via services. OK.
- **Salary sheet:** `app/salary-sheet/page.tsx` — `openDB()` then uses salarySheetService. OK.
- **Employee [id]:** `app/employee/[id]/EmployeePageClient.tsx` — `openDB()` then uses all relevant services. OK.
- **Settings:** `app/settings/page.tsx` — `openDB()`, then items/shifts/holidays and export/import. OK.
- **Employees list:** `app/employees/page.tsx` — `openDB()` then employeeService. OK.

So the DB is opened before any data access on these routes.

---

## 6. Export / import

- **Tauri export:** Settings uses `exportDbToFile()` → `invoke("db_export_with_dialog")` → Rust copies `prodtrack.db` to user-chosen path. OK.
- **Tauri import (native):** `importDbFromFile()` exists in `tauriDb.ts` and uses `db_import_with_dialog` (replace DB file). Settings currently uses the same file input for both JSON and .db and, for .db, uses `importDatabaseFromSqliteBuffer` + `importDatabase` (adapter put/clear). So in Tauri, .db import still ends up in SQLite via adapter; optionally you could use `importDbFromFile()` for .db in Tauri for a direct file replace and native dialog.
- **JSON export/import:** `exportDatabase()` / `importDatabase()` in `exportImport.ts` use adapter `getAll`, `clear`, `put` — so they read/write the same DB (SQLite in Tauri). OK.

---

## 7. Summary

- **DB location:** SQLite file is in Tauri app data dir; comments added in `lib.rs` and `db.rs`/`schema.ts`.
- **All persistent data** is read/written through the adapter; in Tauri that uses SQL via the Rust backend. No business data is stored only in memory or in localStorage.
- **Auth** intentionally uses `localStorage` for app password hash and session only.

No bugs found; only documentation and cross-references between Rust tables and frontend schema were added.
