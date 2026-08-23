# Common Inventory Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/inventory` the canonical operator dashboard for inventory and production while preserving legacy item and production data.

**Architecture:** Add a small canonical catalog/resolver layer over the existing IndexedDB/Tauri services, migrate legacy item references idempotently, and route all new production writes through one service that updates production plus inventory movements. Keep the existing inventory UI and extend it with the shared entry/dashboard controls; remove only the duplicate Items navigation surface and redirect its route.

**Tech Stack:** Next.js App Router, React, TypeScript, IndexedDB/Tauri adapters, Vitest, existing shadcn/ui primitives, SheetJS.

---

### Task 1: Define canonical inventory item fields and migration helpers

**Files:**
- Modify: `lib/services/inventoryService.ts`
- Create: `lib/services/inventoryCatalog.ts`
- Create: `lib/services/__tests__/inventoryCatalog.test.ts`

- [ ] Write failing tests for matching legacy items by code/name, preserving canonical rates, defaulting favourites, archive filtering, and formatting quantities to two decimals.
- [ ] Run `npm test -- lib/services/__tests__/inventoryCatalog.test.ts`; confirm the new helpers fail for missing behavior.
- [ ] Add `rate?: number` and `isFavorite?: boolean` compatibility fields to `InventoryItem`, plus pure helpers `normalizeCatalogKey`, `matchLegacyItem`, `mergeLegacyRate`, `formatInventoryQuantity`, and `isSelectableInventoryItem`.
- [ ] Run the focused tests and then the existing inventory service tests.
- [ ] Commit `feat: add canonical inventory catalog helpers`.

### Task 2: Migrate legacy item references without deleting old stores

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/indexeddb.ts`
- Modify: `src-tauri/src/db.rs`
- Modify: `lib/services/itemService.ts`
- Create: `lib/services/inventoryMigration.ts`
- Create: `lib/services/__tests__/inventoryMigration.test.ts`

- [ ] Write failing migration tests for idempotency, code/name matching, copied rates, and unmatched/ambiguous reporting.
- [ ] Run the focused migration tests and verify they fail because the migration entry point does not exist.
- [ ] Add the next schema version and an idempotent migration report `{ migrated, alreadyMapped, unmatched, ambiguous }`; retain both stores and persist the legacy-to-canonical map.
- [ ] Add adapter-safe upgrade hooks for IndexedDB and Tauri, and call migration once during app/database initialization.
- [ ] Update item resolution to prefer canonical inventory data while falling back to the legacy record for unmapped historical rows.
- [ ] Run migration, database, salary, and production tests.
- [ ] Commit `feat: migrate legacy items to inventory catalog`.

### Task 3: Add one atomic production-and-inventory entry service

**Files:**
- Modify: `lib/services/productionService.ts`
- Modify: `lib/services/inventoryService.ts`
- Modify: `lib/services/salaryService.ts`
- Create: `lib/services/productionEntryService.ts`
- Create: `lib/services/__tests__/productionEntryService.test.ts`

- [ ] Write failing tests proving a day/night entry records employee production, adds finished stock, consumes Box/Sticker/Poly BOM quantities, preserves the note, and rejects missing shift or non-positive quantity.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Implement `saveProductionEntry({date, employeeId, itemId, shift, quantity, note})` using canonical inventory IDs and the existing BOM conversion rules; use a transaction where available and a compensating rollback for adapter failures.
- [ ] Make salary and employee summaries resolve item name/rate through the canonical resolver.
- [ ] Run focused, service, and regression tests.
- [ ] Commit `feat: synchronize production entries with inventory`.

### Task 4: Consolidate navigation and inventory item controls

**Files:**
- Modify: `components/app-sidebar.tsx`
- Modify: `app/items/page.tsx` or create it if absent
- Modify: `app/inventory/[category]/CategoryPageClient.tsx`
- Modify: `components/inventory/big-item-card.tsx`
- Modify: `components/inventory/item-details-dialog.tsx`
- Create: `components/inventory/item-filters.tsx` if the existing page needs a focused filter component

- [ ] Add component tests for favourite toggling, archive/restore, archived-item exclusion from active filters, and compact card details.
- [ ] Run the tests to confirm they fail before the controls are wired.
- [ ] Remove the Items sidebar link, keep Inventory category navigation, and redirect `/items` to `/inventory`.
- [ ] Add favourite and archive actions using existing Button, Badge, DropdownMenu, and Dialog primitives with semantic tokens.
- [ ] Keep cards compact, wrap names, show codes and status, and route full BOM details through the modal.
- [ ] Run typecheck and relevant component/service tests.
- [ ] Commit `feat: consolidate item management under inventory`.

### Task 5: Connect the common dashboard calendar and quick entry modal

**Files:**
- Modify: `app/inventory/page.tsx`
- Modify: `components/inventory/inventory-calendar.tsx`
- Modify: `components/dashboard.tsx` only for shared data adapters if required
- Create: `components/inventory/production-entry-dialog.tsx`
- Create: `components/inventory/inventory-dashboard-data.ts`

- [ ] Add tests for date selection opening the modal, required Day/Night shift validation, default selected date, and dashboard KPI aggregation.
- [ ] Run focused tests and verify the new behaviors fail.
- [ ] Implement a compact common dashboard with inventory, production, shift, and employee KPIs; preserve employee calendar dimensions.
- [ ] Open date activity and production entry in a blurred, dismissible Dialog with accessible title and keyboard escape; use a plain overlay fallback for Chrome 109.
- [ ] Submit through `saveProductionEntry`, then refresh all dashboard queries and show a success/error toast.
- [ ] Run tests, typecheck, and build.
- [ ] Commit `feat: add common inventory production dashboard`.

### Task 6: Preserve workbook export structure where supported

**Files:**
- Modify: `lib/services/inventoryExcel.ts`
- Modify: `app/inventory/page.tsx`
- Create: `lib/services/__tests__/inventoryExcel.test.ts`
- Reference read-only: `/home/dev/Downloads/05-02-2025 DEV LATEST (1).xlsm`

- [ ] Add a fixture/test for five-sheet order, sheet names, and explicit fallback metadata.
- [ ] Run it to establish the current simplified exporter failure.
- [ ] Implement template-aware export when the original workbook is available and VBA-preserving options are supported; otherwise export the existing data format with a visible fallback notice.
- [ ] Verify sheet order and formatting metadata without modifying the source workbook.
- [ ] Run export tests and the full suite.
- [ ] Commit `feat: improve inventory workbook export compatibility`.

### Task 7: Full verification and handoff

**Files:**
- No new production files.

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `curl -fsS http://localhost:3000/inventory` and confirm the route responds.
- [ ] Review `git diff --check` and `git status`; preserve unrelated worktree changes.
- [ ] Summarize migrations, compatibility behavior, tests, and any export limitation.
