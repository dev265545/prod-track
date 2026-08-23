# Admin Configuration Page

## Goal

Provide administrators with one understandable configuration page for supported factory behavior. Configuration changes must be explicit, persisted in the existing `_metadata` store, safe for existing installations, and scoped to future behavior unless the setting explicitly describes a data operation.

## Access and layout

- `/settings` remains admin-only.
- The page becomes a settings hub with grouped sections: General, Production, Inventory, Employees, Calendar, Data, and Security.
- Each setting has a plain-language description and a visible current state.
- Use semantic shadcn components: Card, Switch, Select, Input, Alert, Dialog, Button, and Separator.
- Destructive operations such as history deletion, database import, and master delete remain behind confirmation dialogs and are visually separated from normal configuration.
- Light mode remains the target and the core workflow must work in Chrome 109 on Windows 7; blur, color-mix, and other enhancements need fallbacks.

## Configuration model

Store one versioned `app_settings` metadata row:

```ts
interface AppSettings {
  id: "app_settings";
  version: 1;
  companyName: string;
  defaultShift: "day" | "night";
  weekStartsOn: 0 | 1;
  productionEnabled: boolean;
  productionRequiresEmployee: boolean;
  productionRequiresShift: boolean;
  productionInventoryLinkEnabled: boolean;
  inventoryBomDeductionsEnabled: boolean;
  stickerMultiplier: number;
  lowStockWarningsEnabled: boolean;
}
```

Missing or invalid fields use safe defaults. Settings reads normalize the stored row, so older databases need no destructive migration. Updates merge only known fields and preserve unknown metadata fields for forward compatibility.

Defaults:

- `companyName`: empty string
- `defaultShift`: `day`
- `weekStartsOn`: `1` (Monday)
- `productionEnabled`: `true`
- `productionRequiresEmployee`: `true`
- `productionRequiresShift`: `true`
- `productionInventoryLinkEnabled`: `true` to preserve current behavior
- `inventoryBomDeductionsEnabled`: `true`
- `stickerMultiplier`: `2`
- `lowStockWarningsEnabled`: `true`

## Setting behavior

### Production and Inventory connection

`productionInventoryLinkEnabled` controls only future production entries. When true, a production entry updates finished-goods inventory and, if enabled, deducts Box/Sticker/Poly BOM components. When false, the entry still records employee production and production history, but does not create new inventory movements.

Disabling this setting never deletes, reverses, or recalculates existing movements. Re-enabling it affects only entries saved afterward.

`inventoryBomDeductionsEnabled` is a separate switch so administrators can keep finished-goods inward movements while temporarily stopping component deductions.

`stickerMultiplier` must be a finite number from 0 through 20. It applies only to future BOM deductions.

### Production controls

- `productionEnabled=false` disables production-entry buttons and explains that an administrator disabled them.
- `productionRequiresEmployee` and `productionRequiresShift` control validation in new production forms. Existing records are unaffected.
- `defaultShift` preselects Day or Night; it does not remove the required shift choice when that requirement is enabled.

### Inventory controls

- `lowStockWarningsEnabled=false` hides warning banners and warning KPI emphasis, but does not change stock calculations.
- Archive/favourite state remains item-level data and is not a global setting.

### General and calendar

- `companyName` is available to headers/prints where a name is currently shown.
- `weekStartsOn` changes future calendar rendering only; stored dates do not change.

## Interfaces

Create a focused `appSettingsService` with:

- `getAppSettings(): Promise<AppSettings>`
- `saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings>`
- `resetAppSettings(): Promise<AppSettings>`

The production-entry service reads settings at save time. It must not cache the connection toggle across page sessions, so an administrator change takes effect immediately for the next entry.

## Error handling

- Invalid settings are normalized and saved only in valid form.
- Failed reads use defaults and show a non-blocking warning; the app remains usable.
- Failed writes leave the previous setting in place and show an error toast.
- Disabling a connection shows a confirmation dialog stating that future entries will stop changing inventory and that existing history will remain unchanged.
- Reset asks for confirmation and restores defaults without touching operational data.

## Testing

- Unit tests for defaults, normalization, partial updates, invalid-value handling, and reset.
- Service tests proving production entries respect `productionEnabled`, `productionInventoryLinkEnabled`, `inventoryBomDeductionsEnabled`, and `stickerMultiplier`.
- Component tests for admin-only access, switch state, confirmation behavior, and reset.
- Regression tests proving existing production and inventory records are unchanged when a setting is toggled.
- Run typecheck, full tests, build, and localhost route verification.

## Out of scope

- Rewriting existing production or inventory history when settings change.
- User-specific preferences such as theme or language; those remain in their current providers.
- Adding a general-purpose arbitrary key/value editor.
