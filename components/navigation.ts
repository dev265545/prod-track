/**
 * Single source of truth for the app's information architecture.
 *
 * The app is organised into five *modules*. Every authenticated route belongs
 * to exactly one of them. The home hub, the sidebar and the header breadcrumb
 * all read this file, so a route only has to be described once.
 *
 * Ordering is explicit here — nothing downstream computes a position from a
 * href, so renaming a route can never silently reshuffle the menu.
 */

import {
  CalendarCheck,
  ClipboardCheck,
  Clock,
  Cog,
  FileBarChart,
  FileSpreadsheet,
  Factory,
  LayoutGrid,
  ListChecks,
  ScrollText,
  Shapes,
  SlidersHorizontal,
  UsersRound,
  Warehouse,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { INVENTORY_CATEGORIES } from "@/lib/services/inventoryService";

export type ModuleId =
  | "attendance"
  | "production"
  | "inventory"
  | "payroll"
  | "settings";

export interface NavItem {
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
}

/** A route that belongs to a module but is reached from a list, not the menu. */
export interface DetailRoute {
  href: string;
  /** The `items` href this route sits under, for the breadcrumb trail. */
  parentHref: string;
}

export interface NavModule {
  id: ModuleId;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  icon: LucideIcon;
  /** Where the module card / switcher entry navigates to. */
  href: string;
  adminOnly?: boolean;
  items: NavItem[];
  detailRoutes?: DetailRoute[];
}

/**
 * Icon rule for the whole file: a module and the pages inside it never share an
 * icon. Collapsed, the sidebar is a single column of 20px glyphs with no text,
 * and the module row stays on screen above the page row — so a repeated glyph
 * reads as "the same button twice" to an operator navigating by shape. Every
 * icon below is therefore unique across {all modules} ∪ {the pages of any one
 * module}, and picked for outline shape rather than for fine interior detail.
 */
const inventoryItems: NavItem[] = [
  // The module is the building (Warehouse); its landing page is the tile grid
  // you actually look at, so it gets the grid.
  { href: "/inventory", labelKey: "inventoryNavDashboard", icon: LayoutGrid },
  ...INVENTORY_CATEGORIES.map(({ value }) => ({
    href: `/inventory/${value}`,
    labelKey: CATEGORY_THEME[value].labelKey,
    icon: CATEGORY_THEME[value].icon,
  })),
];

export const MODULES: NavModule[] = [
  {
    id: "attendance",
    labelKey: "navModuleAttendance",
    descriptionKey: "homeModuleAttendanceDesc",
    icon: CalendarCheck,
    // The module lands on today's roster, not on the people list. Both used to
    // look like "a list of people", which is exactly the confusion the client
    // reported; attendance is about *today*, while the people list is a setup
    // screen touched only when somebody joins or leaves.
    href: "/attendance",
    items: [
      // The module is the calendar; today's roster is the clipboard you tick.
      { href: "/attendance", labelKey: "rostNavToday", icon: ClipboardCheck },
      { href: "/employees", labelKey: "rostNavPeople", icon: UsersRound },
      { href: "/shifts", labelKey: "navShifts", icon: Clock },
    ],
    detailRoutes: [{ href: "/employee", parentHref: "/employees" }],
  },
  {
    id: "production",
    labelKey: "navModuleProduction",
    descriptionKey: "homeModuleProductionDesc",
    icon: Factory,
    href: "/production",
    items: [
      { href: "/production", labelKey: "navLinkDailyEntry", icon: ListChecks },
      // Real screen since the Items page was built: it is the only place an
      // item's rate — the number pay is multiplied by — can be set. It used to
      // redirect to Inventory, which has no rate box at all.
      // `Shapes` is the "several different things you make" glyph. Not
      // `Package`, `Box` or `Layers`: the inventory categories own those, and
      // not `Tag`, which the inventory label category owns.
      { href: "/items", labelKey: "navLinkItems", icon: Shapes },
      { href: "/machine", labelKey: "navMachine", icon: Cog },
      { href: "/reports", labelKey: "navReports", icon: FileBarChart },
    ],
  },
  {
    id: "inventory",
    labelKey: "navInventory",
    descriptionKey: "homeModuleInventoryDesc",
    icon: Warehouse,
    href: "/inventory",
    items: inventoryItems,
  },
  {
    id: "payroll",
    labelKey: "navModulePayroll",
    descriptionKey: "homeModulePayrollDesc",
    icon: Wallet,
    href: "/salary-sheet",
    adminOnly: true,
    items: [
      { href: "/salary-sheet", labelKey: "navSalarySheet", icon: FileSpreadsheet },
    ],
  },
  {
    id: "settings",
    labelKey: "navModuleSettings",
    descriptionKey: "homeModuleSettingsDesc",
    icon: SlidersHorizontal,
    href: "/settings",
    adminOnly: true,
    items: [
      // The module is the sliders; the page itself is the spanner.
      { href: "/settings", labelKey: "navSettings", icon: Wrench },
      // The activity log is a scroll of everything that happened — no other
      // module or page uses a text-lines glyph, so it stays distinct collapsed.
      { href: "/audit", labelKey: "auditNavLog", icon: ScrollText },
    ],
  },
];

/**
 * Admin-only modules are hidden outright rather than shown disabled: a greyed
 * "Salary" tile only prompts questions an operator cannot resolve.
 */
export function visibleModules(admin: boolean): NavModule[] {
  return MODULES.filter((m) => !m.adminOnly || admin);
}

/** True when `pathname` is `href` or a route nested below it. */
function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** The module owning `pathname`, or `null` for the home hub and unknown routes. */
export function moduleForPath(pathname: string): NavModule | null {
  if (pathname === "/") return null;
  for (const mod of MODULES) {
    if (mod.items.some((i) => matches(pathname, i.href))) return mod;
    if (mod.detailRoutes?.some((d) => matches(pathname, d.href))) return mod;
    if (matches(pathname, mod.href)) return mod;
  }
  return null;
}

/** The sidebar entry that should read as active for `pathname`. */
export function activeItemHref(pathname: string): string | null {
  const mod = moduleForPath(pathname);
  if (!mod) return null;
  const detail = mod.detailRoutes?.find((d) => matches(pathname, d.href));
  if (detail) return detail.parentHref;
  // Longest match wins so /inventory/box beats /inventory.
  let best: string | null = null;
  for (const item of mod.items) {
    if (matches(pathname, item.href) && (!best || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

export interface Crumb {
  labelKey: MessageKey;
  /** Absent on the final crumb, which is the current page. */
  href?: string;
}

/**
 * Home > Module > Page. Returns `[]` for the hub itself, which needs no trail.
 * Detail routes get the trail up to their parent list; the page appends its
 * own leaf (the employee's name, say).
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const mod = moduleForPath(pathname);
  if (!mod) return [];

  const detail = mod.detailRoutes?.find((d) => matches(pathname, d.href));
  const leafHref = detail ? detail.parentHref : activeItemHref(pathname);
  const leaf = mod.items.find((i) => i.href === leafHref);

  const crumbs: Crumb[] = [
    { labelKey: "navHome", href: "/" },
    { labelKey: mod.labelKey, href: mod.href },
  ];

  // A module whose landing page *is* this page (e.g. /settings) needs no repeat,
  // but a detail route always spells its list out: Attendance > Employees > …
  if (leaf && (detail || leaf.href !== mod.href)) {
    crumbs.push({ labelKey: leaf.labelKey, href: leaf.href });
  }

  // Detail pages append their own leaf, so every crumb here stays clickable.
  if (!detail) crumbs[crumbs.length - 1] = { labelKey: crumbs[crumbs.length - 1].labelKey };
  return crumbs;
}
