# Inventory Quick Entry and Compact Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make inventory items compact and scannable while adding an attendance-style dashboard calendar for recording and reviewing dated stock movements.

**Architecture:** Keep inventory persistence in `inventoryService`. Add a small pure calendar grouping helper for date markers and selected-date entries. Reuse existing `MovementDialog`, `HistorySheet`, `ItemFormDialog`, `ProduceDialog`, and shadcn `Dialog`, `Select`, `DatePicker`, `Button`, and `Badge` primitives. Replace the large card action grid with compact primary actions plus a full-details dialog.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind v4, shadcn/Radix UI, Vitest.

---

### Task 1: Add tested movement-date grouping helpers

**Files:**
- Create: `lib/utils/inventoryCalendar.ts`
- Test: `lib/utils/inventoryCalendar.test.ts`

- [ ] **Step 1: Write the failing tests**

Test that movement rows group by ISO date, count inward/outward entries, and return only entries for a selected date while preserving newest-first order.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run lib/utils/inventoryCalendar.test.ts`
Expected: fail because the helper module does not exist.

- [ ] **Step 3: Implement the pure helpers**

Export `groupInventoryMovementsByDate(movements)` returning `Map<string, { count: number; inward: number; outward: number }>` and `movementsForDate(movements, date)` returning movements sorted by `createdAt` descending.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run lib/utils/inventoryCalendar.test.ts`
Expected: all helper tests pass.

### Task 2: Build a reusable inventory calendar

**Files:**
- Create: `components/inventory/inventory-calendar.tsx`
- Modify: `components/dashboard-calendar.tsx` only if a small shared calendar primitive is extracted; otherwise leave attendance behavior unchanged.

- [ ] **Step 1: Create the inventory calendar API**

Accept `year`, `month`, `onMonthChange`, `movements`, `selectedDate`, and `onDateClick`. Match the attendance calendar’s month navigation, weekday headings, selected state, today state, responsive sizing, and semantic color tokens. Show a small marker/count when a date has movements.

- [ ] **Step 2: Keep the component operator-friendly**

Use explicit date `aria-label`s, large date buttons, no double-click behavior, and a short legend explaining that a dot means stock was entered.

- [ ] **Step 3: Run TypeScript verification**

Run: `npx tsc --noEmit`
Expected: no TypeScript errors.

### Task 3: Add the dashboard quick-entry panel

**Files:**
- Modify: `app/inventory/page.tsx`
- Modify: `lib/i18n/messages.ts`

- [ ] **Step 1: Add dashboard state and data derivations**

Track calendar month, selected date, selected item, movement direction, quantity, and note. Derive selected-date movements with `movementsForDate` and calendar markers with `groupInventoryMovementsByDate`. Default the selected date to today and the selected item to the first active item.

- [ ] **Step 2: Add the save flow**

Validate an item and positive quantity, call `addMovement({ itemId, date: selectedDate, type, qty, note })`, show the existing success/error toast pattern, clear quantity/note, and reload stock/movements so KPI, analysis, markers, and selected-date entries update together.

- [ ] **Step 3: Add the calendar and form layout**

Place the calendar beside a compact form using `Select`, `ToggleGroup` or equivalent two-option control, `Input`, and the selected date. Add a selected-date activity list below or beside the form. Keep the analysis panels below this operational section.

- [ ] **Step 4: Add English and Hindi strings**

Add keys for quick entry title/description, selected date, item, direction, quantity, note, save, movement marker legend, and no entries for selected date in both message dictionaries.

- [ ] **Step 5: Verify the dashboard build**

Run: `npm run build`
Expected: inventory route and all category routes compile and prerender successfully.

### Task 4: Replace large item cards with compact cards and details dialog

**Files:**
- Modify: `components/inventory/big-item-card.tsx`
- Create: `components/inventory/item-details-dialog.tsx`
- Modify: `app/inventory/[category]/CategoryPageClient.tsx`

- [ ] **Step 1: Reduce the card surface**

Render only code/name, current stock/unit, one status badge, `IN`, `OUT`, and `Details`. Remove the large movement summary block and the full-width action grid from the card. Use compact spacing, a smaller stock number, and a 2-column or 3-column responsive grid.

- [ ] **Step 2: Create the details dialog**

Use shadcn `Dialog` with an accessible title. Show the removed stock details and expose existing history, edit, delete, and produce callbacks. Keep actual movement forms and history in their existing components.

- [ ] **Step 3: Wire category state**

Add selected detail item state to `CategoryPageClient`, pass the details callbacks into the dialog, and keep the existing card `IN` / `OUT` handlers unchanged.

- [ ] **Step 4: Verify card behavior**

Run: `npm test`
Expected: all existing tests pass. Manually verify a compact card can open inward/outward, details, history, edit, delete, and produce flows.

### Task 5: Final visual and regression verification

**Files:**
- Modify only files required by the previous tasks.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files and tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: exit code 0 with `/inventory` and all six category routes generated.

- [ ] **Step 3: Verify the running local app**

Run: `curl -fsS http://localhost:3000/inventory >/dev/null`
Expected: the dashboard responds successfully. Confirm manually that selecting a date, saving a movement, and revisiting the date shows the new entry and marker.
