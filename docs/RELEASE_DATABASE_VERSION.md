# Database version shipped with releases

Portable/GitHub releases built by `.github/workflows/release.yml` use the same database layout as the main app. Keep this file updated whenever you bump the schema.

## Schema version (SQLite / IndexedDB)

| Field | Value |
|--------|--------|
| **`DB_VERSION`** | **5** |

**Source of truth:** `lib/db/schema.ts` — `export const DB_VERSION = 5`.

This is the version stored in metadata row `_metadata` / `id = '_schema'` as `schemaVersion`. It drives migrations in:

- Browser: `lib/db/sqliteFileAdapter.ts`, IndexedDB upgrades in `lib/db/indexeddb.ts`
- Optional desktop builds: `src-tauri/src/db.rs` (`CURRENT_SCHEMA_VERSION`)

## Export JSON (backup file)

Import/export files use a separate **export format** version (`EXPORT_VERSION` in `lib/db/exportImport.ts`, currently **1**). That is not the same number as `DB_VERSION`.

## When you release

1. Confirm `DB_VERSION` in `lib/db/schema.ts` matches what you intend to ship.
2. Update the table in this document if you change `DB_VERSION`.
