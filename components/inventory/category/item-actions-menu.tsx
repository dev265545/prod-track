"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Info, MoreVertical, Star } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import type { BigItemCardRow } from "@/components/inventory/big-item-card";

export interface ItemActionsMenuProps {
  item: BigItemCardRow;
  onDetails: (item: BigItemCardRow) => void;
  onFavorite?: (item: BigItemCardRow) => void;
  onArchive?: (item: BigItemCardRow) => void;
  className?: string;
}

/**
 * The one overflow menu shared by the card view and the table view, so both
 * surfaces expose exactly the same secondary actions (details, star, put
 * away). Built on Popover — the repo has no dropdown-menu primitive — with
 * explicit menu roles so the control is announced correctly, and a 44px
 * trigger for gloved fingers on the factory floor.
 */
export function ItemActionsMenu({
  item,
  onDetails,
  onFavorite,
  onArchive,
  className,
}: ItemActionsMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = React.useState(false);
  const archived = item.isActive === false;

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const itemClass =
    "flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className={cn("size-11 shrink-0 rounded-lg", className)}
          aria-label={t("invCatMoreActions")}
        >
          <MoreVertical aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-0.5 p-1.5">
        <div role="menu" aria-label={t("invCatMoreActions")} className="flex flex-col gap-0.5">
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(() => onDetails(item))}
          >
            <Info className="size-4 shrink-0" aria-hidden />
            {t("inventoryViewDetails")}
          </button>
          {onFavorite && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={item.isFavorite === true}
              className={itemClass}
              onClick={run(() => onFavorite(item))}
            >
              <Star
                className={cn(
                  "size-4 shrink-0",
                  item.isFavorite && "fill-current text-warning",
                )}
                aria-hidden
              />
              {item.isFavorite
                ? t("invCatRemoveFavourite")
                : t("invCatAddFavourite")}
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={run(() => onArchive(item))}
            >
              {archived ? (
                <ArchiveRestore className="size-4 shrink-0" aria-hidden />
              ) : (
                <Archive className="size-4 shrink-0" aria-hidden />
              )}
              {archived ? t("invCatRestoreItem") : t("invCatArchiveItem")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
