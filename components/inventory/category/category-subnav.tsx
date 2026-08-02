"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import {
  INVENTORY_CATEGORIES,
  type InventoryCategory,
} from "@/lib/services/inventoryService";
import { cn } from "@/lib/utils";

export interface CategorySubnavProps {
  current: InventoryCategory;
  className?: string;
}

/**
 * Sub-navigation across the six stock categories.
 *
 * Layout rule: this strip must NEVER be the reason the page scrolls sideways.
 * It is a fluid grid, not a row — two columns at phone width, three on small
 * tablets, all six across from `lg` up. Every tile is `min-w-0` with a
 * truncating label, so the grid tracks shrink instead of overflowing, and no
 * tile carries a fixed width. Nothing is ever hidden behind a dropdown or a
 * scroll strip: the operator can always see and reach all six categories.
 */
export function CategorySubnav({ current, className }: CategorySubnavProps) {
  const { t } = useLanguage();

  return (
    <nav
      aria-label={t("invCatNavLabel")}
      className={cn("w-full min-w-0", className)}
    >
      <ul className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {INVENTORY_CATEGORIES.map(({ value }) => {
          const theme = CATEGORY_THEME[value];
          const Icon = theme.icon;
          const active = value === current;
          return (
            <li key={value} className="min-w-0">
              <Link
                href={`/inventory/${value}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] w-full min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : theme.iconChip,
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 truncate">{t(theme.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
