"use client";

import * as React from "react";
import { Check, ChevronsUpDown, PackageSearch, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import {
  countRecentShown,
  orderPickerItems,
  type PickerSearchItem,
} from "@/lib/utils/pickerSearch";

/**
 * "Which item?" as a searchable dialog instead of a drop-down of everything.
 *
 * A <Select> is fine for five items. The production catalogue can now be the
 * whole finished-goods stock list, so the operator scrolls past two hundred
 * rows to find one. He does know one of two things: the item's name, or the
 * short code printed on the physical stock (RT04, S41, B1) — so both are
 * searched, with the shared inventory ranking that puts a typed code first.
 *
 * Two things this deliberately does that a drop-down cannot:
 *
 *  - it says up front which items have NO RATE. Such an item is refused when
 *    the entry form saves, and finding that out after typing a quantity is the
 *    worst possible moment.
 *  - with an empty search box it puts recently used items on top. Daily entry
 *    is the same few items repeatedly, so on the common path there is nothing
 *    to type at all.
 *
 * Keyboard first, because the entry form is: arrows move, Enter chooses,
 * Escape closes, and choosing returns focus to the trigger so the quantity box
 * is one Tab away.
 */

export interface ItemPickerProps {
  /** Everything that can be picked. `ProductionCatalogEntry[]` fits as-is. */
  items: readonly PickerSearchItem[];
  /** Currently selected item id; `""` for nothing chosen yet. */
  value: string;
  /** Called with the chosen item's id. */
  onChange: (id: string) => void;
  /**
   * Item ids in most-recent-first order, shown at the top while the search box
   * is empty. Supplied by the caller — the picker never reads the database.
   */
  recentIds?: readonly string[];
  /** Put on the trigger button, so an outside <Label htmlFor> points at it. */
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function ItemPicker({
  items,
  value,
  onChange,
  recentIds,
  id,
  disabled,
  className,
}: ItemPickerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(
    () => items.find((item) => item.id === value),
    [items, value],
  );

  const handlePick = (itemId: string) => {
    onChange(itemId);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-md border border-input bg-surface-1 px-3 py-2 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {selected ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 max-w-full truncate text-sm font-semibold text-foreground">
              {selected.name}
            </span>
            {selected.code ? <CodeChip code={selected.code} /> : null}
            {selected.rate == null ? <NoRateChip label={t("pickNoRate")} /> : null}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {t("pickChoose")}
          </span>
        )}
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {selected ? t("pickChange") : t("pickChoose")}
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Mounted only while open, so the search box starts empty each time. */}
        {open ? (
          <PickerBody
            items={items}
            value={value}
            recentIds={recentIds}
            onPick={handlePick}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function CodeChip({ code }: { code: string }) {
  return (
    <span className="shrink-0 rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {code}
    </span>
  );
}

function NoRateChip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-warning px-2 py-0.5 text-xs font-semibold text-warning">
      {label}
    </span>
  );
}

function PickerBody({
  items,
  value,
  recentIds,
  onPick,
}: {
  items: readonly PickerSearchItem[];
  value: string;
  recentIds?: readonly string[];
  onPick: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const searching = query.trim().length > 0;

  const ordered = React.useMemo(
    () => orderPickerItems(items, query, recentIds),
    [items, query, recentIds],
  );
  // Only meaningful with an empty box; while searching the list is one ranked
  // block and a "recently used" heading would be a lie.
  const recentCount = React.useMemo(
    () => (searching ? 0 : countRecentShown(ordered, recentIds)),
    [ordered, recentIds, searching],
  );

  // Keep the highlighted row on screen when the arrows walk past the fold.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, ordered]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (ordered.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % ordered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + ordered.length) % ordered.length);
    } else if (event.key === "Enter") {
      // Stopped here so it can never reach the entry form and submit a line
      // the operator was only trying to select an item for.
      event.preventDefault();
      const item = ordered[activeIndex];
      if (item) onPick(item.id);
    }
  };

  return (
    <DialogContent className="flex max-h-[var(--dialog-max-h)] flex-col gap-4 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("pickTitle")}</DialogTitle>
        <DialogDescription>{t("pickDesc")}</DialogDescription>
      </DialogHeader>

      <div className="relative min-w-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // A new query is a new list, so the highlight goes back to the
            // best match rather than staying on whatever row was at that
            // position before.
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("pickSearchPlaceholder")}
          aria-label={t("pickSearchLabel")}
          role="combobox"
          aria-expanded
          aria-controls="item-picker-list"
          aria-activedescendant={
            ordered[activeIndex] ? `item-picker-opt-${activeIndex}` : undefined
          }
          className="min-h-[44px] pl-9"
        />
      </div>

      <p className="min-w-0 text-xs text-muted-foreground">{t("pickHint")}</p>
      <p aria-live="polite" className="sr-only">
        {t("pickCountFound", { count: ordered.length })}
      </p>

      <div ref={listRef} className="min-w-0 flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <Empty className="border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch aria-hidden />
              </EmptyMedia>
              <EmptyTitle>
                {items.length === 0
                  ? t("pickEmptyListTitle")
                  : t("pickNoResultsTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {items.length === 0
                  ? t("pickEmptyListDesc")
                  : t("pickNoResultsDesc")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            id="item-picker-list"
            role="listbox"
            aria-label={t("pickTitle")}
            className="flex min-w-0 flex-col gap-1"
          >
            <Heading
              label={
                searching
                  ? t("pickResultsHeading")
                  : recentCount > 0
                    ? t("pickRecentHeading")
                    : t("pickAllHeading")
              }
            />
            {ordered.map((item, index) => (
              <React.Fragment key={item.id}>
                {index === recentCount && recentCount > 0 ? (
                  <Heading label={t("pickAllHeading")} />
                ) : null}
                <Row
                  item={item}
                  index={index}
                  active={index === activeIndex}
                  chosen={item.id === value}
                  noRateLabel={t("pickNoRate")}
                  noRateHelp={t("pickNoRateHelp")}
                  onHover={() => setActiveIndex(index)}
                  onPick={() => onPick(item.id)}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function Heading({ label }: { label: string }) {
  return (
    <p className="min-w-0 truncate px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
  );
}

function Row({
  item,
  index,
  active,
  chosen,
  noRateLabel,
  noRateHelp,
  onHover,
  onPick,
}: {
  item: PickerSearchItem;
  index: number;
  active: boolean;
  chosen: boolean;
  noRateLabel: string;
  noRateHelp: string;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      id={`item-picker-opt-${index}`}
      role="option"
      aria-selected={chosen}
      data-active={active ? "true" : undefined}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "flex min-h-[44px] w-full min-w-0 flex-col gap-0.5 rounded-md border border-transparent px-3 py-2 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-border bg-surface-3",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {chosen ? (
          <Check className="size-4 shrink-0 text-primary" aria-hidden />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {item.name}
        </span>
        {item.code ? <CodeChip code={item.code} /> : null}
        {item.rate == null ? <NoRateChip label={noRateLabel} /> : null}
      </span>
      {item.rate == null ? (
        <span className="min-w-0 truncate text-xs text-warning">
          {noRateHelp}
        </span>
      ) : null}
    </button>
  );
}
