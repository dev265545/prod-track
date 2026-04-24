# Frontend UI/UX Improvement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve ProdTrack Lite's UI/UX to achieve excellent theme contrast, font sizes, alignment, and overall polish. Ensure everything adheres to frontend-design skill guidelines and feels production-ready.

**Architecture:** Apply fixes systematically by layer—design tokens first, then typography, then components, then pages. Use existing shadcn/ui components where possible; normalize custom styles to design tokens.

**Tech Stack:** Next.js 14, Tailwind CSS v4, shadcn/ui, next-themes, Space Grotesk + Inter fonts

**Skills to reference:** @frontend-design, @audit, @polish, @harden, @normalize

---

## Task 1: Fix design token and color consistency

**Files:**
- Modify: `app/globals.css`
- Modify: `app/reports/page.tsx:259`
- Modify: `app/login/page.tsx:60-62`

**Step 1: Replace hard-coded colors with design tokens**

In `app/reports/page.tsx`, replace:
```tsx
// Line 259 - change from:
<p className="py-4 text-base text-gray-500 dark:text-gray-400">
// To:
<p className="py-4 text-base text-muted-foreground">
```

In `app/login/page.tsx`, replace error message styling:
```tsx
// Lines 60-62 - change from:
<p className="text-sm text-red-600 dark:text-red-400" role="alert">
// To:
<p className="text-sm text-destructive" role="alert">
```

**Step 2: Replace hard-coded dark mode colors in globals.css**

In `app/globals.css`, replace the `.dark input, .dark select, .dark textarea` block (lines 205-211) to use CSS variables instead of `#0c0c0c` and `#fafafa`:

```css
.dark input,
.dark select,
.dark textarea {
  background: hsl(var(--card)) !important;
  border-color: hsl(var(--border)) !important;
  color: hsl(var(--foreground)) !important;
}
```

Similarly, update `.dark .dark-card` (lines 194-199) to use `hsl(var(--card))` instead of `#0c0c0c` if it uses hard-coded values.

**Step 3: Verify**

Run `npm run build` and visually check login, reports, and settings in light and dark mode. Ensure no contrast regressions.

---

## Task 2: Unify typography and font loading

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Step 1: Add Space Grotesk via next/font and remove duplicate Google Fonts import**

In `app/layout.tsx`, add Space Grotesk and use both fonts:

```tsx
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-background text-foreground min-h-screen font-sans">
```

**Step 2: Remove Google Fonts @import from globals.css**

In `app/globals.css`, remove line 3:
```css
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap");
```

**Step 3: Ensure Tailwind theme and base layer use font variables**

The `@theme` block in globals.css maps `--font-sans: var(--font-body)` and `--font-heading: var(--font-heading)`. The base layer sets `body { font-family: var(--font-body) }` and `h1–h6 { font-family: var(--font-heading) }`. The layout's next/font classes will set `--font-body` and `--font-heading` on `html`, overriding any `:root` values. No changes needed to globals.css for font variables—just remove the Google Fonts @import.

**Step 4: Verify**

Run dev server, check that headings use Space Grotesk and body uses Inter. No FOUT. Run `npm run build`.

---

## Task 3: Establish consistent spacing scale and card padding

**Files:**
- Modify: `app/globals.css`
- Modify: `components/dashboard.tsx`
- Modify: `components/app-shell.tsx`

**Step 1: Add app-wrap spacing token**

In `app/globals.css`, add to `:root`:
```css
--app-wrap-padding: clamp(1rem, 2vw, 1.75rem);
```

Update `.app-wrap`:
```css
.app-wrap {
  max-width: 64rem;
  margin: 0 auto;
  padding: var(--app-wrap-padding) clamp(1rem, 4vw, 1.5rem);
}
```

**Step 2: Unify main content spacing**

In `components/dashboard.tsx`, `app/settings/page.tsx`, `app/reports/page.tsx`, `app/employees/page.tsx`, `app/employee/[id]/EmployeePageClient.tsx`, use consistent `space-y-8` for main (or `space-y-10` for settings which has more sections). Document: Dashboard, Reports, Employees, Employee page use `space-y-8`; Settings uses `space-y-10`. Verify all match.

**Step 3: Unify card padding**

Create a shared card class or ensure all cards use `p-6 sm:p-8` (responsive). Audit: Dashboard uses `p-8`, Employees uses `p-6 sm:p-8`, Settings uses `p-8`, Reports uses `p-8`, EmployeePageClient uses `p-8`. Standardize to `p-6 sm:p-8` for consistency and better mobile.

**Step 4: Remove redundant header label**

In `components/app-shell.tsx`, remove or replace the "Menu" span in the header—it's redundant with the sidebar trigger. Either remove it or use a dynamic page title.

```tsx
// Change from:
<span className="text-sm font-medium text-muted-foreground">Menu</span>
// To: remove entirely, or use a breadcrumb/contextual label
```

**Step 5: Verify**

Check all pages at 375px, 768px, 1280px. Spacing should feel consistent.

---

## Task 4: Ensure touch targets and focus states meet accessibility

**Files:**
- Modify: `app/globals.css`
- Modify: `components/dashboard.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/employees/page.tsx`
- Modify: `app/employee/[id]/EmployeePageClient.tsx`

**Step 1: Increase btn-icon minimum size for touch**

In `app/globals.css`, update `.btn-icon`:
```css
.btn-icon {
  /* ... existing ... */
  min-width: 2.75rem;   /* 44px */
  min-height: 2.75rem;
  width: 2.75rem;
  height: 2.75rem;
}
```

**Step 2: Add visible focus ring to all interactive elements**

Ensure all buttons, links, inputs have `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Audit dashboard quick-add button, settings buttons, employee links. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` where missing.

**Step 3: Verify primary buttons use sufficient size**

Dashboard "Add" button, Settings "Add item", Employees "Add employee" should have `min-h-[44px]` or equivalent for touch. Check and add where missing.

**Step 4: Verify**

Tab through each page. Every interactive element should show a clear focus ring. Test on mobile viewport—touch targets ≥44px.

---

## Task 5: Normalize form controls to use shadcn components

**Files:**
- Modify: `components/dashboard.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/employee/[id]/EmployeePageClient.tsx`
- Modify: `app/reports/page.tsx`

**Step 1: Replace native inputs with Input/Label/Button where beneficial**

Dashboard quick-add form: Replace raw `<input>`, `<select>`, `<button>` with `Input`, `Label`, `Button` from `@/components/ui` where it improves consistency. Keep `type="date"` and `type="number"` as native if shadcn doesn't have equivalents—but ensure they use the same border/ring tokens.

**Step 2: Use consistent input classes**

Create a shared constant or ensure all form controls use:
- `rounded-lg` or `rounded-xl` (match existing)
- `border-input` or `border-2 border-input`
- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- `h-10` or `min-h-[44px]` for touch

**Step 3: Use Label with htmlFor consistently**

All inputs must have associated labels. Audit: Dashboard date input has `id="dashboardDate"` and label `htmlFor="dashboardDate"`. Verify all forms.

**Step 4: Verify**

Run `npm run build`. Forms should look consistent across Dashboard, Settings, Employees, Employee page, Reports.

---

## Task 6: Improve empty states and loading feedback

**Files:**
- Modify: `components/dashboard.tsx`
- Modify: `app/employees/page.tsx`
- Modify: `app/reports/page.tsx`
- Modify: `app/employee/[id]/EmployeePageClient.tsx`

**Step 1: Enhance empty states per onboard skill**

Dashboard "No production for this date" → Add brief guidance: "Add production using the form below or from an employee page."

Employees "No employees yet" → Already has "Add one below to get started." Keep it.

Reports "No production data yet" → Add: "Add production from the Dashboard or Employee pages to see reports."

**Step 2: Use Skeleton for loading states**

Replace plain "Loading..." text with a subtle skeleton or spinner where appropriate. In Dashboard, Settings, Reports, Employees, EmployeePageClient—use `Skeleton` from `@/components/ui/skeleton` for the main content area during load, or a minimal spinner with "Loading..." for quick loads.

**Step 3: Verify**

Check empty states on each page. Loading states should not cause layout shift.

---

## Task 7: Polish tables for alignment and readability

**Files:**
- Modify: `components/dashboard.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/reports/page.tsx`
- Modify: `app/employees/page.tsx`
- Modify: `app/employee/[id]/EmployeePageClient.tsx`

**Step 1: Use Table components from shadcn**

Consider replacing raw `<table>` with `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` from `@/components/ui/table` for consistent styling and accessibility. If tables are simple, ensure at minimum:
- `role="grid"` or proper table semantics
- `scope="col"` on header cells
- Consistent cell padding: `py-3 sm:py-4 px-4`
- Numeric columns: `text-right tabular-nums`

**Step 2: Add table container overflow**

All tables should be in `overflow-x-auto` for mobile. Verify Dashboard, Settings, Reports, Employees, EmployeePageClient.

**Step 3: Verify**

Tables should align, scroll horizontally on narrow screens, and have clear header hierarchy.

---

## Task 8: Final contrast and theme verification

**Files:**
- Modify: `app/globals.css`
- All page components

**Step 1: Verify WCAG contrast ratios**

- `--muted-foreground` on `--background`: ≥4.5:1 for body text
- `--foreground` on `--background`: ≥4.5:1
- `--primary-foreground` on `--primary`: ≥4.5:1
- `--destructive` on white/light: ≥4.5:1

Use browser DevTools or a contrast checker. If any fail, adjust HSL values in `:root` and `.dark`.

**Step 2: Verify dark mode**

Toggle dark mode. Check: cards, inputs, borders, text. No gray-on-gray that fails contrast. Sidebar should remain readable.

**Step 3: Verify reduced motion**

`@media (prefers-reduced-motion: reduce)` in globals.css already exists. Ensure `animate-fade-in` and any transitions respect it. Add `prefers-reduced-motion: reduce` handling to `animate-fade-in` if needed.

**Step 4: Run full verification**

```bash
npm run build
```

Open app, test light/dark, all pages, keyboard nav, screen reader if available.

---

## Task 9: Remove redundant Dashboard quick links (optional)

**Files:**
- Modify: `components/dashboard.tsx`

**Step 1: Consider removing duplicate nav**

Dashboard has quick links (Production report, Employees, Settings) that duplicate the sidebar. Options:
- Remove them (sidebar is sufficient)
- Keep but style as secondary/ghost links
- Move to a compact "Quick links" section with less prominence

Recommendation: Keep but reduce visual weight—use `text-muted-foreground hover:text-foreground` and smaller text. Or remove if sidebar is always visible.

**Step 2: Verify**

Dashboard doesn't feel cluttered; navigation is clear.

---

## Execution Summary

| Task | Focus |
|------|-------|
| 1 | Design tokens, no hard-coded colors |
| 2 | Typography, font loading |
| 3 | Spacing, card padding, app-wrap |
| 4 | Touch targets, focus states |
| 5 | Form controls, shadcn components |
| 6 | Empty states, loading feedback |
| 7 | Table alignment, accessibility |
| 8 | Contrast, theme, reduced motion |
| 9 | Dashboard quick links (optional) |

**Verification command:** `npm run build` and manual QA on all pages in light/dark mode.

---

## Suggested Commands for Fixes

- Use `/normalize` to align with design system (Tasks 1, 5, 7)
- Use `/polish` for alignment, spacing, focus states (Tasks 3, 4, 7)
- Use `/harden` for accessibility, error states, edge cases (Tasks 4, 6)
- Use `/audit` to re-verify after implementation
