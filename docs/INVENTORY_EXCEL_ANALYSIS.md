# Legacy Inventory Workbook Analysis

**Source file:** `05-02-2025 DEV LATEST (1).xlsm` (88 KB, macro-enabled Excel, from user's Downloads)
**Purpose of this document:** Reverse-engineer how the workbook actually works so the team can port its logic into ProdTrack Lite.

## 1. What This Workbook Actually Is

This is a **pure stock / inventory ledger** for a plastic-molding factory. There is **no billing, invoicing, customer, GST, rate, or amount data anywhere in the workbook**. What might look like "billing" at a glance is really **component / BOM (bill-of-materials) consumption tracking** — finished containers "consume" boxes, stickers, and poly film, and the workbook rolls that consumption back into raw-material stock. There is no customer-facing or financial concept in this file at all.

## 2. Workbook & Sheet Structure

| # | Sheet name | XML file | Buttons | Role |
|---|---|---|---|---|
| 1 | Box, Dana, Poly (4) | sheet1.xml (largest) | 5 | Raw-material layer: box board, plastic pellets (dana), poly film |
| 2 | Container (3) | sheet2.xml | 3 | Finished-goods layer: plastic containers |
| 3 | Sticker (2) | sheet3.xml | 4 | Sub-ledger: printed stickers used on containers/glass |
| 4 | Sheet1 | sheet4.xml | 0 | Empty placeholder — unused |
| 5 | Glass | sheet5.xml | 3 | Finished-goods layer: despite the name, another container ledger |

### Sheet Relationship Diagram

```
                    ┌─────────────────────────────┐
                    │  Box, Dana, Poly (4)         │
                    │  RAW MATERIALS               │
                    │  - Boxes (RT../B.. codes)    │
                    │  - Dana (plastic pellets, kg)│
                    │  - Poly (printed film,       │
                    │    pcs → kg conversion)       │
                    └───────────┬─────────┬────────┘
                     box code(M)│         │poly code(R/Q)
                                │         │
              ┌─────────────────┘         └─────────────────┐
              │                                              │
   ┌──────────▼──────────┐                       ┌───────────▼──────────┐
   │  Container (3)       │                       │  Glass                │
   │  FINISHED GOODS      │                       │  FINISHED GOODS       │
   │  RD/RCT/OCTA/5CP/8CP │                       │  SSB/BIG-FC/BRIOWATI/ │
   │                      │                       │  MOCK-T/WAVE/KFC cups │
   └──────────┬───────────┘                       └───────────┬───────────┘
              │ sticker code (O)                               │ sticker code (O)
              └───────────────────────┬─────────────────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │  Sticker (2)            │
                          │  SUB-LEDGER (S1..S55)   │
                          └─────────────────────────┘

Sheet1 (empty placeholder) — not part of the data flow.
```

- **Box, Dana, Poly (4)** is the raw-material layer: box board, plastic masterbatch pellets, and printed poly film.
- **Container (3)** and **Glass** are the finished-goods layer. Each finished-goods SKU declares, via code columns, which box, sticker, and poly component it consumes (its "packing recipe" / BOM).
- **Sticker (2)** is a sub-ledger of sticker codes referenced by both finished-goods sheets.
- Every item row on every real sheet carries a **product code** (e.g. `RT04`, `B1`, `S19`, `RT08`) that acts as the relational key joining sheets together — there is no formal database, just matching text codes across independent sheets.

## 3. Common Structural Pattern (All Real Sheets)

- Top rows contain `=TODAY()` and `=TODAY()-1`, labeling a pair of stock-movement columns with "today" and "yesterday" dates.
- Header row captions follow a consistent shorthand:
  - **B/C** = Balance Carried (forward) — i.e. opening stock
  - **IN** = inward stock (received)
  - **A**, **B**, **D** = various outward/consumption columns (naming is inconsistent per sheet)
  - **B/C** (second occurrence) = closing stock
  - A **LOW** flag column
- No merged cells anywhere. Sections are separated by blank rows or "group header" count rows instead of formal grouping.
- **Core accounting identity:** `closing = opening + inward - outward`, though the exact column letters and formula shape differ per sheet:

| Sheet | Formula (row 4 example) | Notes |
|---|---|---|
| Sheet1 (Box/Dana/Poly) | `=D4+E4-F4-G4` (→ H4) | Standard opening + in − out − out |
| Sheet2 (Container) | `=C4+D4+E4-F4` (→ D4) | **Self-referencing**: D4 appears on both sides, i.e. a running accumulation formula written into the same cell it reads |
| Sheet3 (Sticker) | `=C4+D4-E4-F4` (→ D4) | Same self-referencing pattern as Container |
| Sheet5 (Glass) | `=C4+D4+E4-F4` (→ E4) | Same pattern as Container |

- **LOW-stock flag formula** (present on all sheets, targeting the closing-stock column):
  ```
  =IF(<closing_cell><100,"LOW"," ")
  ```
  Flags any item whose closing stock has fallen below 100 units.

## 4. Sheet-by-Sheet Detail

### 4.1 Sheet 1 — "Box, Dana, Poly (4)"

Three distinct product families stacked in one sheet, separated by blank/header rows:

**a) Boxes** (codes `RT..`, `B..`) — cardboard box types: FANCY D, KFC boxes, RD box variants, meal trays.
Columns: name, CU.FT (volume), B/C opening, IN, A/B outward variants, B/C closing, BOX TYPE code.

**b) Dana** (plastic masterbatch pellets, in kg) — MASTERBATCH DANA CLEAR / BLACK / YELLOW / WHITE, H.GRINDING, etc.

**c) Poly** (printed polythene rolls/bags) — has an extra column **K** = weight-per-unit conversion factor (kg per piece, e.g. `0.25`, `0.34`), plus **N/O** piece-count columns. Formulas convert pieces to kilograms:
```
E53 = IFERROR(K53*N53,0)
G53 = IFERROR(K53*O53,0)
```
A small "GOL DAANA 25 KG" raw-dana section sits at the bottom of the sheet. "Step 1..5" notes in columns K/L are manual, human-facing workflow checklist markers (not formulas or logic).

### 4.2 Sheet 2 — "Container (3)"

Finished plastic containers: RD/RCT/OCTA/5CP/8CP types.

| Column | Meaning |
|---|---|
| A | Short code (e.g. `RD-180-6`) |
| B | Full description, with an `(R#/B#)`-style tag |
| C | Opening stock |
| D | Inward |
| E/F | Outward |
| G | Closing stock |
| H | LOW flag |
| M | Box code — cross-references Sheet1 (Box) |
| O | Sticker code — cross-references Sheet3 |
| R | Poly code — cross-references Sheet1 (Poly) |

Each container row effectively declares its **packing recipe**: which box, sticker, and poly component it consumes.

### 4.3 Sheet 3 — "Sticker (2)"

Printed-sticker sub-ledger, grouped by container family.

| Column | Meaning |
|---|---|
| A | Sticker code (`S1`..`S55`) |
| B | Description |
| C | Opening |
| D | Inward |
| E/F | Outward |
| G | Closing |
| H | LOW flag |

Sheet2 column O (values like `S1`, `S2`, ...) matches Sheet3 column A — this is the join key between finished-goods and the sticker sub-ledger.

### 4.4 Sheet 5 — "Glass"

Despite the name, this is **another finished-container ledger** (not actually glassware): SSB cups, BIG-FC, BRIOWATI, MOCK-T, WAVE, SUPREME, KFC cups, RD BLACK/MILKY variants, plus a poly-cup section and a GOL DAANA row.

Same structural shape as Container:

| Column | Meaning |
|---|---|
| A | Code |
| B | Description with R#/B# tags |
| C–F | Opening/inward/outward movement |
| — | Closing stock |
| — | LOW flag |
| M | Box/mold code |
| O | Sticker code |
| Q | Poly code |

**Known defect:** cell A1 contains a corrupted formula `=+A1:H75TODAY()`, which evaluates to `#NAME?`. This is a leftover copy/paste artifact and has no functional purpose — it should not be ported.

## 5. VBA Macros

The workbook has **no UserForms**, **no linked-cell controls**, and **no worksheet/workbook event code** (all class modules are empty). All interactivity comes from **12 standard modules** driving **15 Form Control command buttons**. Button-to-macro bindings live in legacy VML drawing parts (`vmlDrawing*.vml`, `<x:FmlaMacro>` attribute) rather than in any modern event model.

### 5.1 Module Reference

| Module | Sub | Sheet | Behavior |
|---|---|---|---|
| Module1 | `clearStock()` | Box/Dana/Poly | Clears `E4:E100`; `F4:F51`, `F82:F90`, `F73:F80`; matching `G` ranges; `N49:O100`; resets status cells `Q7`, `Q13`, `P21`. Prep step before a new update run. |
| Module2 | `COPY_BPD()` | Box/Dana/Poly | Copies `H4:H150` and paste-special-**values** into `D4:D150` (freezes the computed closing balance into the next period's opening). Writes `"ALREADY UPDATED BOXES"` to `P21`. |
| Module3 | `clearStockContainer()` | Container | Clears `D4:D150`, `E4:E150`, `F4:F150`. Resets `Q14`. |
| Module4 | `COPY_Container()` | Container | Copies `G4:G150` → `C4:C150` as values. Sets `Q14 = "ALREADY UPDATED BOXES"`. |
| Module5 | `clearStockSticker()` | Sticker | Clears `D/E/F 4:150`. Resets `Q7` and `Q14`. |
| Module6 | `COPY_Sticker()` | Sticker | Copies `G4:G150` → `C4:C150` as values. Sets `Q14` flag. |
| Module7 | `clearStockGlass()` | Glass | Clears `D/E/F 4:150`. Resets `R14`. |
| Module8 | `COPY_Glass()` | Glass | Copies `G4:G150` → `C4:C150` as values. Sets `R14` flag. |
| Module9 | `updateBoxes()` | cross-sheet | Loops `Container!M4:M200` and `Glass!M4:M100` (box-code keys); finds a matching key in `BoxDanaPoly!I4:I100`; accumulates two quantity columns (offset `-3`, `-2` from the match) by **adding** source values (offset `-9`, `-8`). Rolls finished-goods box consumption back into raw box stock. Sets `Q13` flag. |
| Module10 | `updateSTICKERS()` | cross-sheet | Same match/accumulate pattern from `Container` columns O & P and `Glass` column O against `Sticker!A4:A100`; adds `value * 2` (a stickers-per-unit factor) into two offset columns. Sets `Q7 = "ALREADY DONE"`. |
| Module11 | `updatePOLY()` | cross-sheet | Same pattern from `Container!R4:R200` and `Glass!Q4:Q100` matched against `BoxDanaPoly!I53:I100` / `J53:J100`; accumulates (some values doubled). Sets `Q7 = "ALREADY UPDATED POLY"`. |
| Module12 | `msg()` | — | Trivial orphan stub: writes `"already clicked once !!!!!!!!!"` to the active cell. **Not wired to any button** — dead code. |

### 5.2 Button → Macro Bindings

| Sheet | Button label | Bound macro | Status |
|---|---|---|---|
| Box, Dana, Poly (4) | "CLEAR A,B,D,IN" | `clearStock` | working |
| Box, Dana, Poly (4) | "UPDATE B/C" | `COPY_BPD` | working |
| Box, Dana, Poly (4) | "UPDATE BOXES" | `updateBoxes` | working |
| Box, Dana, Poly (4) | "UPDATE PLOY" *(sic)* | `updatePOLY` | working |
| Box, Dana, Poly (4) | "print" | `Button10_Click` | **broken — no such Sub exists** |
| Container (3) | "UPDATE B/C" | `COPY_Container` | working |
| Container (3) | "CLEAR A,B,D,IN" | `clearStockContainer` | working |
| Container (3) | "PRINT" | — | **dead — no macro bound at all** |
| Sticker (2) | "UPDATE B/C" | `COPY_Sticker` | working |
| Sticker (2) | "CLEAR A,B,D,IN" | `clearStockSticker` | working |
| Sticker (2) | "UPDATE STICKERS" | `updateSTICKERS` | working |
| Sticker (2) | "PRINT" | `Button11_Click` | **broken — orphaned reference** |
| Glass | "CLEAR A,B,D,IN" | `clearStockGlass` | working |
| Glass | "UPDATE B/C" | `COPY_Glass` | working |
| Glass | "PRINT" | `Button11_Click` | **broken — same orphaned reference as above** |

There is **no billing or print functionality of any kind** in this workbook. Every "PRINT" button across all four real sheets is either bound to a missing Sub or has no binding at all.

## 6. The Implied Daily Workflow

Reconstructed from the macro set, the intended manual operating sequence is:

1. **Enter movements.** The operator types the day's inward/outward stock movements directly into each sheet's `IN`/`A`/`B`/`D` columns.
2. **Roll up finished-goods consumption.** Click "UPDATE BOXES" / "UPDATE STICKERS" / "UPDATE PLOY" (on the Box/Dana/Poly sheet) to push consumption recorded on the Container and Glass sheets back into the corresponding raw-material rows (cross-sheet reconciliation via `updateBoxes`, `updateSTICKERS`, `updatePOLY`).
3. **Freeze the closing balance.** Click "UPDATE B/C" on each sheet (`COPY_BPD`, `COPY_Container`, `COPY_Sticker`, `COPY_Glass`) to copy the computed closing-stock column as static values into the opening-stock column, effectively rolling the period forward.
4. **Reset for the next day.** Click "CLEAR A,B,D,IN" on each sheet to wipe that day's movement columns and reset the "ALREADY UPDATED" status flags, leaving the sheet ready for the next day's entries.

## 7. Hardcoded Dependencies & Fragility

The macros are tightly coupled to the workbook's exact current shape:

- **Sheet names must match exactly**, including the parenthetical numbers: `"Box, Dana, Poly (4)"`, `"Container (3)"`, `"Sticker (2)"`, `"Glass"`. Renaming any sheet breaks every bound macro.
- **Fixed cell/range references** throughout (e.g. `D4:D150`, `E4:E100`, `Q7`, `Q13`, `Q14`, `P21`, `R14`) — rows beyond 150 (or 100, inconsistently) are silently excluded from clear/copy operations.
- **Column OFFSETS are hardcoded** in the cross-sheet reconciliation macros (e.g. `Offset(0, -9)`, `Offset(0, -3)`), plus **magic multiplication factors** (the `* 2` sticker-per-unit factor in `updateSTICKERS`). None of this is documented in the sheet itself — it's implicit in the VBA.
- **Status flags (`Q7`, `Q13`, `Q14`, `P21`, `R14`) are purely cosmetic strings** ("ALREADY UPDATED BOXES", "ALREADY DONE", etc.) that are **never read/checked** by any macro before running. There is **no re-entrancy guard** — clicking an "UPDATE" button twice will silently double-count stock movements, since the macros only ever write these flags, never branch on them.

## 8. Portability Notes / Implications for a Web App

Practical takeaways for porting this logic into ProdTrack Lite:

- **No real database — just matching text codes.** Cross-sheet relationships (Container ↔ Box/Poly/Sticker, Glass ↔ Box/Poly/Sticker) are implemented purely by string-matching product codes (`RT04`, `B1`, `S19`, etc.) across independently maintained sheets, with no referential integrity. A web app should model this explicitly as a real BOM/recipe relation (e.g. a `component_links` table keyed by product code) rather than reproducing string-matching lookups.
- **Fragile hardcoded cell offsets and ranges.** All the reconciliation logic (`updateBoxes`, `updateSTICKERS`, `updatePOLY`) depends on fixed column offsets (`Offset(0,-9)`, `Offset(0,-3)`, etc.) and row ceilings (100/150/200 inconsistently) baked into VBA rather than derived from headers or schema. Any new row beyond those hardcoded bounds, or any column insertion, silently breaks the sheet. A web app must use named/typed fields instead of positional offsets.
- **"Freeze closing → opening" is a manual period-close step, not a real ledger.** The `COPY_*` macros paste computed values over formulas to roll the period forward. This is really an ad-hoc, manual version of a stock-ledger "period close" operation and should become a first-class, atomic "close period" transaction in the web app (ideally versioned/auditable, unlike the Excel version which destroys the prior formula history in place).
- **One-shot "ALREADY UPDATED" flags are not enforced.** The status flags in `Q7`/`Q13`/`Q14`/`P21`/`R14` are cosmetic text written by the macros but never checked before re-running — so double-clicking "UPDATE BOXES" (or running it twice by mistake) silently double-counts consumption with no warning and no protection. Any port **must** add real idempotency/guard logic (e.g. a "period already reconciled" check) that the original spreadsheet never had.
- **Self-referencing formulas indicate implicit "add to running total" semantics.** Sheet2/3/5's closing formulas (e.g. `D4 = C4+D4+E4-F4`) read and write the same cell, meaning the "closing" cell is really functioning as an accumulator across repeated data entry, not a pure function of opening+in-out. This should become an explicit running-balance/ledger-entry model server-side, not a spreadsheet-style circular formula.
- **Dead/broken print buttons — no real print or billing capability exists.** Every "PRINT" button is either bound to a missing macro (`Button10_Click`, `Button11_Click` — Subs that don't exist) or not bound at all. There is nothing to port here functionally; ProdTrack Lite's existing print pipeline (`lib/utils/print.ts`) already supersedes this with working functionality, and no legacy "billing" concept needs to be preserved (there wasn't one).
- **Manual, per-sheet, per-day operator workflow.** The four-step Clear → Enter → Update → Freeze cycle is entirely manual and sheet-by-sheet; a web app can safely collapse this into a single "record today's movements" action per item with automatic downstream recalculation, removing the need for the user to click four separate buttons across four separate sheets in a specific order.
- **Inconsistent units/conversions embedded ad hoc.** The Poly section's piece→kg conversion (`E53 = IFERROR(K53*N53,0)`) uses a per-row manual conversion factor (column K) that varies per item (0.25, 0.34, etc.) with no unit metadata elsewhere in the sheet. This should become an explicit `unit_weight_kg` field on the raw-material record, not an unlabeled adjacent column.
- **Known data corruption should not be replicated.** Glass sheet cell A1 (`=+A1:H75TODAY()`, `#NAME?`) is a copy/paste leftover with no function and should simply be discarded when porting, not reproduced or "fixed" in place.
- **"Glass" is a misleading sheet name** — it contains no glassware, only more plastic finished-goods containers structurally identical to the Container sheet. The web app's data model should merge Container and Glass into one finished-goods entity type rather than preserving the historical (and confusing) sheet split, unless there's a business reason (e.g. separate production lines) to keep them distinct.
