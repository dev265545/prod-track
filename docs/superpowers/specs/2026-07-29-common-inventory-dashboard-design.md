# Common Inventory and Production Dashboard

## Status

Approved design; implementation is intentionally not included in this document.

## Goal

Make Inventory the single operator-facing home for stock, production, and item setup. Factory operators should be able to see the important numbers, choose a date and shift, record production quickly, and trust that inventory, employee output, and component consumption stay synchronized.

The existing production history and old item records must remain readable during migration. Removing the Items screen means removing the duplicate UI, not deleting the underlying data before it has been migrated and verified.

## User experience

### Navigation

- `/inventory` is the common dashboard.
- The sidebar keeps Inventory and its category links, but removes the separate Items navigation entry.
- `/items` redirects to `/inventory` so old bookmarks do not break.
- Category pages remain focused list views for Box, Dana, Poly, Container, Sticker, and Glass.

### Dashboard

The dashboard is analysis-first, with compact cards and a shared calendar sized like the employee dashboard. It contains:

- KPIs for total inventory items, low/out-of-stock items, today’s production, day-shift production, night-shift production, and active production employees.
- A date-aware calendar. Selecting a date opens a blurred modal containing that date’s production and inventory activity; it does not expand the dashboard vertically.
- A simple quick-entry action that defaults to the selected date and requires a shift: Day or Night.
- Trend/category summaries and actionable low-stock information, using semantic theme colors rather than category-colored slabs.

### Inventory list and item cards

- Item cards are compact, consistently aligned, and readable at a glance.
- The visible hierarchy is product name, code/specification, stock/status, and Inward/Outward actions.
- Full details open in a modal and include Box Code, Sticker Code, and Poly Code where present.
- Stock quantities display at most two decimal places; whole numbers do not show unnecessary decimals.
- Each item has Favourite and Archive controls. Favourites can be filtered. Archived items remain visible in history and can be restored, but are excluded from new production selectors.
- Add/edit/delete/archive actions use existing shadcn primitives and semantic tokens. No arbitrary category colors or decorative full-card borders are introduced.

## Canonical data model

`inventory_items` becomes the canonical item catalog for new UI and new writes.

The inventory item model gains:

- `rate`: numeric production/pay rate currently held by legacy Items records.
- `isFavorite`: boolean, default `false`.

Existing `isActive` is the archive state; `false` means archived. Existing `code`, `boxCode`, `stickerCode`, and `polyCode` remain the authoritative codes for bill-of-materials linkage.

Production records continue to use stable item IDs and normalized `day`/`night` shifts. New production entries reference inventory item IDs. Existing records that reference legacy item IDs are migrated or mapped before the legacy catalog becomes read-only.

## Single-entry data flow

The common entry form contains:

- required date
- required employee
- required inventory item
- required Day/Night shift
- required quantity greater than zero
- optional note

Saving one entry is one logical operation:

1. Create the employee production record with item, date, quantity, shift, and note.
2. Add finished-goods stock to the selected inventory item.
3. Deduct Box, Sticker, and Poly components using the existing BOM codes and conversion rules.
4. Refresh dashboard KPIs, calendar markers, employee output, and inventory balances.

If any part fails, the operation reports an error and must not leave a partial production/inventory update. Backend implementations should use a transaction where supported and a compensating/recovery path for IndexedDB where a multi-store transaction cannot cover every adapter operation.

## Migration and compatibility

- On upgrade, match legacy Items to inventory items by normalized code first, then normalized name.
- Preserve the old item ID mapping so historical production and salary calculations resolve to the canonical inventory item.
- Copy legacy `rate` values to inventory items without overwriting a deliberately populated canonical rate.
- Report unmatched or ambiguous rows instead of guessing. The migration must be repeatable and idempotent.
- Keep legacy item storage readable for one compatibility period; no destructive store deletion is part of this feature.
- Salary and employee views must read canonical item names/rates through a shared resolver, with legacy fallback only for records not yet migrated.

## Export behavior

The export action should use the original workbook at `Downloads/05-02-2025 DEV LATEST (1).xlsm` as the template when available. It must preserve the workbook’s five-sheet order, yellow formatting, formulas, and VBA project where the chosen XLSX library supports it. If template-preserving export is unavailable, the UI must clearly label the fallback export and must not imply that formatting/macros were preserved.

## Visual and browser constraints

- Light mode remains the target.
- Use the project’s semantic shadcn tokens, existing typography, compact spacing, and restrained borders/shadows.
- Use existing components such as Card, Badge, Table, Calendar, Dialog, Alert, Select/Combobox, and ToggleGroup rather than hand-built equivalents.
- Dialogs have an accessible title, backdrop blur with a non-blur fallback, predictable close behavior, and keyboard escape support.
- Avoid CSS features that prevent the core workflow from working in Chrome 109, the final Chrome release supporting Windows 7. Newer visual enhancements must have plain-color fallbacks.

## Error and empty states

- If no employee or item is available, the entry modal explains what must be created and provides a direct link/action.
- Archived items cannot be selected for new entries and explain why when encountered through a stale link.
- Invalid quantity, missing shift, or missing date is shown at the field and prevents submission.
- Low/out-of-stock states are actionable and link to the relevant category/list.
- Migration ambiguity and export fallback are shown as clear, non-technical notices.

## Testing strategy

- Unit tests for legacy-to-canonical matching, rate migration, archive/favourite filtering, two-decimal quantity formatting, shift-required validation, and BOM component calculations.
- Service tests proving one production entry updates production history, finished stock, and component stock together.
- Regression tests proving old production records and salary calculations still resolve names/rates.
- Component tests for dashboard date selection, modal open/close, and archived-item exclusion.
- Build, typecheck, and the complete existing test suite before handoff.

## Out of scope

- Deleting legacy database stores.
- Replacing the existing employee dashboard wholesale.
- Reworking unrelated payroll, shift, or machine-planning features.
- Promise of VBA preservation when the selected export library cannot preserve VBA; this must use the explicit fallback behavior above.
