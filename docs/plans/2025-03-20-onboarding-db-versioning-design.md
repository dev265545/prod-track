# Design: First-time Onboarding + Database Versioning

**Date:** 2025-03-20  
**Status:** Design approved — ready for implementation plan

---

## 1. Purpose and scope

- **First-time onboarding:** When a user installs ProdTrack for the first time, show a welcome flow (no password gate). Ask if they have existing JSON or .db to import. Require them to set a password before continuing. Never show this flow again.
- **Database versioning:** Add schema versioning and migrations so app upgrades (e.g. vA → vB) can update the DB without destroying data. Migrations run silently on app open.

---

## 2. First-time onboarding

### 2.1 Entry point

- On app load (before any route), check `firstRunComplete` in `localStorage`.
- If not set → redirect to `/onboarding`.
- If set → normal flow (login if needed, then dashboard).

### 2.2 Flow (Option C: Replace login on first run)

- **No password gate** on first launch.
- Single-page wizard at `/onboarding` with step state.

### 2.3 Steps

| Step | Screen | Actions |
|------|--------|---------|
| 1 | Welcome | "Welcome to ProdTrack" + "Get started" |
| 2 | Resync choice | "Do you have existing data to import?" → "Yes, import JSON or .db" \| "No, start fresh" |
| 3a | Import (if Yes) | File picker (.json or .db) → validate → import → success/error |
| 3b | Skip (if No) | Go to Step 4 |
| 4 | Set password | Required: create password + confirm. No skip. |
| 5 | Complete | Set `firstRunComplete`, persist password, start session, redirect to `/` |

### 2.4 Guards

- After onboarding, `/onboarding` redirects to `/` if `firstRunComplete` is set.
- Backend: no changes; all client-side (localStorage, existing import APIs).

---

## 3. Database versioning

### 3.1 Metadata storage

- Add `_metadata` table (SQLite) and `_metadata` store (IndexedDB if kept).
- Store: `{ id: "_schema", schemaVersion: number }`.
- `DB_VERSION` in `schema.ts` = current app schema version.

### 3.2 Flow on DB open

1. Open DB (create if missing).
2. Ensure `_metadata` table exists.
3. Read `schemaVersion` from `_metadata` (default 0 if missing).
4. If `schemaVersion < DB_VERSION`: run migrations in order from `schemaVersion+1` to `DB_VERSION`.
5. Write `schemaVersion = DB_VERSION` to `_metadata`.

### 3.3 Migrations (Hybrid: forward-only + idempotent where possible)

- Each migration: `migrate_N_to_N+1()`.
- Forward-only: run in sequence.
- Idempotent: use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN` only if not exists.
- Locations: `lib/db/migrations/` (TS for IndexedDB), Rust for SQLite.

### 3.4 SQLite (Tauri — primary)

- Add `_metadata` to `TABLES` in `db.rs`.
- Migration runner in Rust runs SQL for each step.
- Additive changes preferred; avoid destructive ops.

### 3.5 IndexedDB (if kept for web/dev)

- Add `_metadata` store.
- Run migrations in TS on open.

### 3.6 Export/import

- Export includes `schemaVersion`.
- On import: if imported `schemaVersion` > app `DB_VERSION` → reject ("Created by newer version. Please update ProdTrack.").
- If imported `schemaVersion` < app `DB_VERSION` → run migrations on imported data before writing.

---

## 4. Data safety and silent migrations

### 4.1 Silent UX

- Migrations run during `openDB()` before any data access.
- No dialogs, banners, or extra loading.
- User does not notice; app continues normally.

### 4.2 Data safety

- **Additive changes:** New columns/tables use `IF NOT EXISTS`.
- **No destructive defaults:** Prefer `ALTER TABLE`, new columns; avoid `DROP`/`DELETE` unless required.
- **Backup before risky changes:** For destructive migrations, copy `prodtrack.db` to `prodtrack.db.backup` first.
- **Atomic:** SQLite: migrations in transaction; rollback on error.

### 4.3 Failure handling

- On migration failure: rollback, log error, show "Database update failed. Please restart the app or contact support."
- Do not overwrite or truncate data on failure.

### 4.4 Version compatibility

- Import from newer schema → reject with clear message.
- Import from older schema → migrate in memory/temp DB before writing.

---

## 5. Assumptions

- **Tauri primary:** SQLite is the main backend. IndexedDB only for browser/dev if needed.
- **First-run detection:** `firstRunComplete` in localStorage; no server.
- **Password:** Required on first run; no skip.

---

## 6. Next step

Invoke **writing-plans** skill to create the implementation plan.
