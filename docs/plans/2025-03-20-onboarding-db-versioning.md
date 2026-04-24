# First-time Onboarding + Database Versioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-time onboarding (welcome → resync choice → import → set password) and database schema versioning with silent migrations so app upgrades update the DB without data loss.

**Architecture:** Onboarding: single-page wizard at `/onboarding`, guarded by `firstRunComplete` in localStorage. DB versioning: `_metadata` table/store with `schemaVersion`; migrations run in `openDB()` before any data access. SQLite (Tauri) primary; IndexedDB migrations if kept.

**Tech Stack:** Next.js 14, React, Tauri 2, Rust (rusqlite), localStorage

---

## Phase 1: First-run detection and routing

### Task 1: Add first-run flag and check utility

**Files:**
- Create: `lib/onboarding.ts`

**Step 1: Create the utility**

```typescript
// lib/onboarding.ts
const STORAGE_FIRST_RUN_COMPLETE = "prodtrack_first_run_complete";

export function isFirstRunComplete(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_FIRST_RUN_COMPLETE) === "1";
}

export function setFirstRunComplete(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_FIRST_RUN_COMPLETE, "1");
}
```

**Step 2: Commit**

```bash
git add lib/onboarding.ts
git commit -m "feat: add first-run completion flag"
```

---

### Task 2: Create onboarding layout and redirect guard

**Files:**
- Create: `app/onboarding/layout.tsx`
- Create: `app/onboarding/page.tsx` (placeholder)

**Step 1: Create layout (no AppShell, full-screen for wizard)**

```tsx
// app/onboarding/layout.tsx
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6">
      {children}
    </div>
  );
}
```

**Step 2: Create placeholder page**

```tsx
// app/onboarding/page.tsx
"use client";

export default function OnboardingPage() {
  return <div>Onboarding (placeholder)</div>;
}
```

**Step 3: Commit**

```bash
git add app/onboarding/layout.tsx app/onboarding/page.tsx
git commit -m "feat: add onboarding route and layout"
```

---

### Task 3: Add first-run redirect in root layout or middleware

**Files:**
- Modify: `app/layout.tsx` (or create `components/FirstRunGuard.tsx` used in layout)
- Create: `components/FirstRunGuard.tsx`

**Approach:** Use a client component that runs on mount, checks `isFirstRunComplete()`, and redirects to `/onboarding` if false. Wrap app content. On `/onboarding`, the guard should NOT redirect away (we're already there).

**Step 1: Create FirstRunGuard**

```tsx
// components/FirstRunGuard.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isFirstRunComplete } from "@/lib/onboarding";

export function FirstRunGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isFirstRunComplete()) {
      if (!pathname?.startsWith("/onboarding")) router.replace("/onboarding");
    } else {
      if (pathname === "/onboarding") router.replace("/");
    }
  }, [pathname, router]);

  return <>{children}</>;
}
```
```

**Step 2: Add guard to root layout**

In `app/layout.tsx`, wrap the `{children}` (inside body) with `<FirstRunGuard>`. Ensure it only wraps the main app, not the onboarding route. Check layout structure first.

**Step 3: Verify** — Remove `firstRunComplete` from localStorage, load app → should redirect to `/onboarding`. Set it, reload → should go to login/home.

**Step 4: Commit**

```bash
git add components/FirstRunGuard.tsx app/layout.tsx
git commit -m "feat: add first-run redirect guard"
```

---

## Phase 2: Onboarding wizard UI

### Task 5: Build onboarding wizard steps (1–4)

**Files:**
- Modify: `app/onboarding/page.tsx`
- Create: `components/onboarding/OnboardingWizard.tsx` (or keep logic in page)

**Step 1: Implement step state and steps**

```tsx
// app/onboarding/page.tsx - structure
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [wantsImport, setWantsImport] = useState<boolean | null>(null);
  const router = useRouter();

  // Step 1: Welcome
  if (step === 1) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to ProdTrack</CardTitle>
          <p className="text-sm text-muted-foreground">
            Track production, advances, and salaries for your team.
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setStep(2)} className="w-full">
            Get started
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 2: Resync choice
  if (step === 2) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Do you have existing data?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Import from a JSON or .db backup, or start fresh.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="default"
            onClick={() => { setWantsImport(true); setStep(3); }}
          >
            Yes, import JSON or .db file
          </Button>
          <Button
            variant="outline"
            onClick={() => { setWantsImport(false); setStep(4); }}
          >
            No, start fresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 3: Import (when wantsImport === true)
  // Step 4: Set password
  // ... (implement in next tasks)
}
```

**Step 2: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: add onboarding steps 1 and 2"
```

---

### Task 6: Add Step 3 (import) with file picker

**Files:**
- Modify: `app/onboarding/page.tsx`
- Reuse: `importDatabase`, `validateExportData` from `lib/db/exportImport`
- Reuse: `importDbFromFile` from `lib/db/tauriDb` (Tauri) or file input for browser

**Step 1: Add file input and import logic**

- Hidden `<input type="file" accept=".json,.db" />` with ref.
- Button "Choose file" triggers input click.
- On file selected: read file, parse JSON or handle .db (Tauri: use `db_import_with_dialog` or read file; browser: use `importDatabaseFromSqliteBuffer` for .db, `importDatabase` for JSON).
- Show success or error message.
- "Continue" button advances to Step 4.

**Step 2: Handle Tauri vs browser**

- Tauri: `invoke("db_import_with_dialog")` replaces DB file directly. For JSON, use existing `importDatabase`.
- Browser: File input → read as ArrayBuffer/Text → parse → `importDatabase` or `importDatabaseFromSqliteBuffer`.

**Step 3: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: add onboarding step 3 (import)"
```

---

### Task 7: Add Step 4 (set password) and completion

**Files:**
- Modify: `app/onboarding/page.tsx`
- Reuse: `setAppPassword`, `startSession` from `lib/auth`

**Step 1: Add password form**

- Two inputs: password, confirm password.
- Validation: min length (e.g. 4), passwords must match.
- On submit: `setAppPassword(password)`, `setFirstRunComplete()`, `startSession()`, `router.replace("/")`.

**Step 2: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: add onboarding step 4 (set password) and completion"
```

---

### Task 8: Add onboarding redirect for completed users

**Files:**
- Modify: `app/onboarding/page.tsx` or `app/onboarding/layout.tsx`

**Step 1: Redirect if first run already complete**

At top of onboarding page (or in layout), if `isFirstRunComplete()` → `router.replace("/")`. Prevents users from revisiting onboarding after completion.

**Step 2: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: redirect away from onboarding when already complete"
```

---

## Phase 3: Database versioning (SQLite / Tauri)

### Task 9: Add _metadata table to SQLite schema

**Files:**
- Modify: `src-tauri/src/db.rs`

**Step 1: Add _metadata to TABLES**

```rust
const TABLES: &[&str] = &[
    "_metadata",
    "items",
    "employees",
    // ... rest
];
```

**Step 2: Ensure _metadata is created**

The existing `CREATE TABLE IF NOT EXISTS` loop will create it. Schema: `(id TEXT PRIMARY KEY, data TEXT)` like others. We'll store `{ "id": "_schema", "schemaVersion": N }` in `data`.

**Step 3: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): add _metadata table for schema versioning"
```

---

### Task 10: Add migration runner and get/set schema version in Rust

**Files:**
- Modify: `src-tauri/src/db.rs`
- Create: `src-tauri/src/db/migrations.rs` (or inline in db.rs)

**Step 1: Add commands to read/write schema version**

```rust
fn get_schema_version(conn: &Connection) -> Result<u32, String> {
    let mut stmt = conn.prepare("SELECT data FROM _metadata WHERE id = '_schema'")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let data: String = row.get(0).map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        return Ok(v.get("schemaVersion").and_then(|n| n.as_u64()).unwrap_or(0) as u32);
    }
    Ok(0)
}

fn set_schema_version(conn: &Connection, version: u32) -> Result<(), String> {
    let data = serde_json::json!({ "id": "_schema", "schemaVersion": version }).to_string();
    conn.execute(
        "INSERT OR REPLACE INTO _metadata (id, data) VALUES ('_schema', ?1)",
        rusqlite::params![data],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
```

**Step 2: Add migration runner**

```rust
const CURRENT_SCHEMA_VERSION: u32 = 4; // Match DB_VERSION in schema.ts

fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version = get_schema_version(conn)?;
    if version == 0 {
        // Fresh DB or pre-versioning: assume current schema, no migrations
        set_schema_version(conn, CURRENT_SCHEMA_VERSION)?;
        return Ok(());
    }
    let mut v = version;
    while v < CURRENT_SCHEMA_VERSION {
        v += 1;
        run_migration(conn, v)?;
        set_schema_version(conn, v)?;
    }
    Ok(())
}

fn run_migration(conn: &Connection, to_version: u32) -> Result<(), String> {
    match to_version {
        1..=4 => { /* No-op: baseline through current */ }
        _ => {}
    }
    Ok(())
}
```

**Step 3: Call run_migrations in get_conn after opening**

In `get_conn`, after opening the connection and creating tables, call `run_migrations(&conn)?`.

**Step 4: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): add schema version read/write and migration runner"
```

---

### Task 11: Sync DB_VERSION between schema.ts and Rust

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `src-tauri/src/db.rs`

**Step 1: Ensure single source of truth**

- `lib/db/schema.ts`: `export const DB_VERSION = 4;`
- Rust: use same value. Option: read from a generated file or keep manually in sync. For now, document that `CURRENT_SCHEMA_VERSION` in db.rs must match `DB_VERSION` in schema.ts.

**Step 2: Commit**

```bash
git add lib/db/schema.ts src-tauri/src/db.rs
git commit -m "chore: sync DB_VERSION between frontend and Rust"
```

---

## Phase 4: Database versioning (IndexedDB, if kept)

### Task 12: Add _metadata store and migration runner for IndexedDB

**Files:**
- Modify: `lib/db/indexeddb.ts` — create _metadata store in createSchema, add migration on open

**Note:** Do NOT add _metadata to STORES in schema.ts — STORES is for business data export/import. _metadata is system-only.

**Step 1: Add _metadata store**

In `createSchema`, add:
```typescript
if (!db.objectStoreNames.contains("_metadata")) {
  db.createObjectStore("_metadata", { keyPath: "id" });
}
```

**Step 2: Add migration runner**

After `openDB` succeeds, read `_metadata` for `_schema`, get `schemaVersion`. If < DB_VERSION, run migrations (put/update records as needed), then write new version.

**Step 3: Integrate into openDB**

The `onupgradeneeded` already runs when version changes. For migrations that don't change object stores, we need a separate "app-level" migration step after open. Add a `runMigrations()` that runs after `openDB()` and is called from adapter's `openDB` when using IndexedDB.

**Step 4: Commit**

```bash
git add lib/db/indexeddb.ts lib/db/adapter.ts
git commit -m "feat(db): add _metadata and migrations for IndexedDB"
```

---

## Phase 5: Export/import with schema version

### Task 13: Update export to include schemaVersion

**Files:**
- Modify: `lib/db/exportImport.ts`

**Step 1: Export already has schemaVersion**

`exportDatabase()` returns `schemaVersion: DB_VERSION`. Verify it's present. If not, add it.

**Step 2: Commit** (if change needed)

---

### Task 14: Update import to validate and migrate schema version

**Files:**
- Modify: `lib/db/exportImport.ts`
- Modify: `lib/db/sqliteBrowser.ts` (if it produces ExportData)

**Step 1: Reject import from newer schema**

In `validateExportData` or before `importDatabase`, if `data.schemaVersion > DB_VERSION`, return `{ valid: false, error: "This file was created by a newer version. Please update ProdTrack." }`.

**Step 2: Migrate on import from older schema**

If `data.schemaVersion < DB_VERSION`, run migrations on the in-memory data before writing. For now, if schema is compatible (same store structure), we can import as-is. When we add migrations that change record shape, we'll add migration logic for imported data.

**Step 3: Commit**

```bash
git add lib/db/exportImport.ts
git commit -m "feat: validate schema version on import, reject newer"
```

---

## Phase 6: Integration and testing

### Task 15: Ensure openDB runs before onboarding import

**Files:**
- Modify: `app/onboarding/page.tsx`

**Step 1: Call openDB before import**

When user selects a file to import, ensure `openDB()` has been called first (DB must exist). Add `await openDB()` before `importDatabase` or equivalent.

**Step 2: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "fix: ensure DB is open before onboarding import"
```

---

### Task 16: Manual test checklist

**Steps:**
1. Clear localStorage, delete prodtrack.db (Tauri app data dir). Launch app → should show onboarding.
2. Complete onboarding: welcome → start fresh → set password → should land on dashboard.
3. Log out, clear localStorage but keep DB. Launch → should show login (first run complete).
4. Clear everything again. Onboarding → import JSON → set password → verify data appears on dashboard.
5. Bump DB_VERSION, add a no-op migration. Launch with existing DB → should migrate silently, no errors.

---

## Execution handoff

Plan complete and saved to `docs/plans/2025-03-20-onboarding-db-versioning.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints.

Which approach?
