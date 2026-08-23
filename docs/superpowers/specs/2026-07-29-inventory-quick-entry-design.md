# Inventory compact cards and dated quick entry

## Goal

Make daily inventory work fast for factory operators: item lists should be compact and scannable, while full item information remains available on demand. The dashboard should support recording a dated stock movement without navigating into a category.

## Approved design

### Compact item cards

Category pages keep the card view, but each card becomes a small operator card containing only:

- item code and name;
- current stock and unit;
- one clear status badge;
- primary `IN` and `OUT` actions;
- a `Details` action.

Opening stock, inward/outward totals, produce, history, edit, and delete move into the details dialog. This keeps the grid dense without removing capability. The existing table view remains available for users who prefer a spreadsheet-like view.

### Item details dialog

The details dialog shows the item identity, current stock, status, opening stock, movement totals, and the existing actions for history, edit, delete, and production where applicable. It reuses the existing movement, history, produce, and edit flows so stock rules remain centralized.

### Dashboard dated quick entry

The dashboard reuses the attendance calendar interaction pattern:

- month navigation and date selection;
- a visual marker/count on dates with inventory movements;
- a selected-date movement list;
- a simple entry form for item, inward/outward, quantity, selected date, and optional note.

Saving calls the existing `addMovement` service, then refreshes dashboard stock, calendar markers, and the selected-date list. The selected calendar date is the default date for new entries, while the operator can change it before saving.

### Dashboard order

The inventory dashboard is ordered for daily operation:

1. summary KPIs;
2. calendar and quick stock entry;
3. movements for the selected date;
4. stock health and category analysis;
5. low-stock and recent-activity analysis.

## Accessibility and UX

- Use existing shadcn dialogs, buttons, badges, inputs, selects, and date/calendar primitives.
- Keep labels explicit and large enough for floor use, without returning to oversized cards.
- Preserve keyboard access and dialog titles.
- Keep English and Hindi message keys in sync for new labels.

## Verification

- TypeScript/build must pass.
- Existing inventory and movement tests must pass.
- Verify that a dated entry changes the selected-date list and calendar marker after save.
- Verify that compact card actions still open the existing movement/history/edit/delete/produce flows.
