"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, PackageSearch } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CATEGORY_LABEL_KEY } from "@/components/inventory/shared";
import type { InventoryItem } from "@/lib/services/inventoryService";

export interface ItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: InventoryItem[];
  onPick: (item: InventoryItem) => void;
}

/**
 * Plain "which item?" step. The operator taps one item, and the caller opens
 * the shared MovementDialog for it — so stock is only ever recorded in one
 * place, with one form.
 */
export function ItemPickerDialog({
  open,
  onOpenChange,
  items,
  onPick,
}: ItemPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so the search box starts empty every time. */}
      {open ? <PickerBody items={items} onPick={onPick} /> : null}
    </Dialog>
  );
}

function PickerBody({
  items,
  onPick,
}: Pick<ItemPickerDialogProps, "items" | "onPick">) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLocaleLowerCase().includes(q) ||
        item.code.toLocaleLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <DialogContent className="flex max-h-[var(--dialog-max-h)] flex-col gap-4 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t("invHubPickItem")}</DialogTitle>
        <DialogDescription>{t("invHubPickItemDesc")}</DialogDescription>
      </DialogHeader>

      <div className="relative min-w-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("invHubSearchItems")}
          aria-label={t("invHubSearchItems")}
          className="min-h-[44px] pl-9"
        />
      </div>

      {/* The only feedback that typing did anything: it changes with no focus
          moving to it, so it has to announce itself. */}
      <p aria-live="polite" className="sr-only">
        {t("a11yResultCount", { count: matches.length })}
      </p>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {matches.length === 0 ? (
          <Empty className="border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invHubNoSearchResults")}</EmptyTitle>
              <EmptyDescription>
                {t("invHubNoSearchResultsDesc")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {matches.map((item) => (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex min-h-[44px] w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-3"
                >
                  <span className="max-w-[8rem] shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {item.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t(CATEGORY_LABEL_KEY[item.category])}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogContent>
  );
}
