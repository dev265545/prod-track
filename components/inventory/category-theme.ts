import {
  Package,
  Atom,
  Layers,
  Box,
  Tag,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { InventoryCategory } from "@/lib/services/inventoryService";
import type { MessageKey } from "@/lib/i18n/messages";
import { CATEGORY_LABEL_KEY } from "@/components/inventory/shared";

/**
 * Each inventory category owns one slot of the categorical data palette
 * (`--chart-1 … --chart-6`, defined in app/globals.css). The six slots are six
 * distinct hues validated for deuteranopia/protanopia separation in both
 * themes — they are identities, never a ramp, so the mapping below is FIXED:
 * a category keeps its hue no matter how many categories are on screen. Each
 * slot holds the same hue family in light and dark (teal · blue · green ·
 * violet · plum · rose), so the theme switch never re-identifies a category.
 *
 * Chart colors are MARK colors, not ink. Every slot clears 3:1 against its
 * card (WCAG 1.4.11 non-text contrast) but several sit below 4.5:1 — fine for
 * a chip, a stripe or an icon, not fine for a label or a number. So `text`
 * stays on an ink token, and identity is carried by the icon + the label +
 * the colored chip — the secondary encoding that keeps the six tiles readable
 * side by side even where color perception is reduced.
 */
export interface CategoryTheme {
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Tailwind classes for the card surface: neutral card + border, no colored fill */
  tileBg: string;
  /** Tailwind classes for the icon chip background + icon color, tinted off this category's chart token */
  iconChip: string;
  /** Tailwind text color class for values and headings — always an ink token, never the series color */
  text: string;
  /** Thin accent bar/stripe color (1-2px rule, not a block) — this category's chart token */
  stripe: string;
}

const TILE_SURFACE = "border-border bg-card";
const TILE_INK = "text-foreground";

function slot(labelKey: MessageKey, icon: LucideIcon, n: 1 | 2 | 3 | 4 | 5 | 6): CategoryTheme {
  return {
    labelKey,
    icon,
    tileBg: TILE_SURFACE,
    // Static strings so Tailwind's scanner sees every class it must generate.
    iconChip: ICON_CHIP[n],
    text: TILE_INK,
    stripe: STRIPE[n],
  };
}

const ICON_CHIP = {
  1: "bg-chart-1/12 text-chart-1",
  2: "bg-chart-2/12 text-chart-2",
  3: "bg-chart-3/12 text-chart-3",
  4: "bg-chart-4/12 text-chart-4",
  5: "bg-chart-5/12 text-chart-5",
  6: "bg-chart-6/12 text-chart-6",
} as const;

const STRIPE = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
} as const;

export const CATEGORY_THEME: Record<InventoryCategory, CategoryTheme> = {
  box: slot(CATEGORY_LABEL_KEY.box, Package, 1),
  dana: slot(CATEGORY_LABEL_KEY.dana, Atom, 2),
  poly: slot(CATEGORY_LABEL_KEY.poly, Layers, 3),
  container: slot(CATEGORY_LABEL_KEY.container, Box, 4),
  sticker: slot(CATEGORY_LABEL_KEY.sticker, Tag, 5),
  glass: slot(CATEGORY_LABEL_KEY.glass, Wine, 6),
};
