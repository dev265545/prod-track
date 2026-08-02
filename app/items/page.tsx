"use client";

/**
 * Items and their money — the only place an item's *rate* can be set.
 *
 * Until this screen existed, `/items` redirected to Inventory, and no screen in
 * the app had a rate box: an item created anywhere could never be paid, while
 * the production form told the operator to "open Items and set a rate first" —
 * naming a screen he could not reach. Pay is quantity × rate
 * (`salaryService`), so the missing box was missing pay.
 *
 * It also matters with the production/inventory link switched OFF: production
 * then falls back to the legacy `items` store, and this is the only screen that
 * can add, price or remove those rows.
 *
 * The list is deliberately BOTH item lists: the `items` rows, plus every
 * finished stock item that has no `items` row yet. A thing added on the Stock
 * screen had no money box there and no row here, so it could be picked in
 * Production and then refused for want of a rate with nowhere to fix it.
 * Pricing such a row here creates its `items` row (`priceStockItem`, the same
 * call production makes on first use) and it becomes an ordinary row. There is
 * still exactly one place a price is typed — `resolveEntryRate` makes the
 * `items` row win, so the number read here is always the number paid.
 *
 * Nothing here is optimistic. Every change is written first and the list is
 * then re-read from the database, so the screen can never show a rate the
 * database does not hold.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  IndianRupee,
  Info,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Shapes,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { LoadError } from "@/components/load-error";
import { useLanguage } from "@/components/language-provider";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  ItemEditorDialog,
  type ItemDraft,
} from "@/components/items/item-editor-dialog";
import {
  countUnpricedItems,
  filterItemRows,
  isStockRow,
  normalizeItemRows,
  stockItemRow,
  type ItemRow,
} from "@/lib/utils/itemCatalog";
import {
  deleteItem,
  getItem,
  getItems,
  saveItem,
} from "@/lib/services/itemService";
import { getAppSettings } from "@/lib/services/appSettingsService";
import {
  loadUnpairedStockItems,
  priceStockItem,
} from "@/lib/services/productionCatalog";

/** The search box only earns its space once the list is long enough to scan. */
const SEARCH_THRESHOLD = 8;

const rateFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

interface PageData {
  items: ItemRow[];
  /** True when production reads the stock list; changes only a help note here. */
  stockLinked: boolean;
  /** How many of `items` are stock items still waiting for their first price. */
  fromStock: number;
}

/**
 * The list is the `items` rows *plus* every finished stock item that has no
 * `items` row yet.
 *
 * Without the second half, an item added on the Stock screen was priceable
 * nowhere: the Stock form has no money box, and this screen only knew about
 * `items` rows — so production offered the item, refused to save it for want
 * of a rate, and sent the owner here to a list it was not in. Both halves are
 * shown together on purpose; the price is still typed in one place, and the
 * moment it is typed the row becomes an ordinary `items` row.
 */
async function fetchPageData(): Promise<PageData> {
  const [rows, settings, stock] = await Promise.all([
    getItems(),
    getAppSettings(),
    loadUnpairedStockItems().catch(() => []),
  ]);
  const stockRows = stock.map(stockItemRow);
  return {
    items: [...normalizeItemRows(rows), ...stockRows],
    stockLinked: settings.productionInventoryLinkEnabled,
    fromStock: stockRows.length,
  };
}

export default function ItemsPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const [data, setData] = useState<PageData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);

  const load = useCallback(async () => {
    setData(await fetchPageData());
  }, []);

  /**
   * A failed read must NOT become `{ items: [] }` — that renders the empty
   * state, which tells the owner his item list is empty when in fact the
   * database threw. Loading, empty and failed stay three separate things.
   */
  const reload = useCallback(() => {
    setLoadFailed(false);
    setData(null);
    fetchPageData()
      .then(setData)
      .catch((err) => {
        console.error("items: load failed", err);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    if (!guardReady) return;
    reload();
  }, [guardReady, reload]);

  if (loadFailed) {
    return (
      <AppShell>
        <main className="flex min-w-0 flex-col gap-6">
          <LoadError onRetry={reload} />
        </main>
      </AppShell>
    );
  }

  if (!guardReady || data === null) {
    return (
      <AppLoadingScreen
        title={t("itmLoadingTitle")}
        description={t("itmLoadingDesc")}
      />
    );
  }

  const items = data.items;
  const shown = filterItemRows(items, query);
  const unpriced = countUnpricedItems(items);
  const showSearch = items.length >= SEARCH_THRESHOLD;

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (item: ItemRow) => {
    setEditing(item);
    setEditorOpen(true);
  };

  /**
   * Save, then re-read. The stored row is fetched first so fields this screen
   * does not show (anything an older build or another module wrote) survive
   * the edit instead of being dropped.
   */
  const handleSave = async (draft: ItemDraft): Promise<boolean> => {
    try {
      // A stock row has no `items` row to update — pricing it creates one, by
      // the same call production makes on first use, so an item priced here is
      // an item production is guaranteed to accept.
      if (editing && isStockRow(editing) && editing.stockItemId) {
        const result = await priceStockItem(
          {
            id: editing.stockItemId,
            name: editing.name,
            code: editing.code,
          },
          draft.rate ?? 0,
        );
        if (!result.ok) {
          toast.error(t("rateStockNeedAmount"));
          return false;
        }
        await load();
        toast.success(t("itmSaveSuccess"));
        return true;
      }
      const existing = editing ? await getItem(editing.id) : null;
      await saveItem({
        ...(existing ?? {}),
        ...(editing ? { id: editing.id } : {}),
        name: draft.name,
        code: draft.code ?? "",
        // `undefined` would be dropped by a structured-clone write and leave an
        // old rate in place; `null` is what "not priced" is stored as.
        rate: draft.rate,
      });
      await load();
      toast.success(t("itmSaveSuccess"));
      return true;
    } catch {
      // The list on screen is still the list in the database: nothing was
      // re-rendered from the draft, so there is nothing to roll back.
      toast.error(t("itmSaveFail"));
      return false;
    }
  };

  const handleDelete = async (item: ItemRow) => {
    try {
      await deleteItem(item.id);
      await load();
      toast.success(t("itmDeleteSuccess"));
    } catch {
      toast.error(t("itmDeleteFail"));
      await load().catch(() => {});
    }
  };

  return (
    <AppShell>
      <main className="animate-fade-in flex w-full min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("itmTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("itmSubtitle")}
          </p>
        </header>

        <div className="flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Info className="size-5 shrink-0" aria-hidden />
            {t("itmWhyTitle")}
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t("itmWhyBody")}
          </p>
          {data.stockLinked ? (
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("itmStockLinkNote")}
            </p>
          ) : null}
        </div>

        {unpriced > 0 ? (
          <div className="flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-surface-3 p-4">
            <p className="flex items-center gap-2 text-base font-semibold text-warning">
              <AlertTriangle className="size-5 shrink-0" aria-hidden />
              {unpriced === 1
                ? t("itmNeedRateOneTitle")
                : t("itmNeedRateTitle", { count: unpriced })}
            </p>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("itmNeedRateBody")}
            </p>
          </div>
        ) : null}

        {data.fromStock > 0 ? (
          <div className="flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
            <p className="flex items-center gap-2 text-base font-semibold text-foreground">
              <PackageSearch className="size-5 shrink-0" aria-hidden />
              {data.fromStock === 1
                ? t("rateFromStockOneTitle")
                : t("rateFromStockTitle", { count: data.fromStock })}
            </p>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("rateFromStockBody")}
            </p>
          </div>
        ) : null}

        <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {showSearch ? (
            <div className="flex min-w-0 flex-col gap-2 sm:max-w-sm sm:flex-1">
              <Label htmlFor="itemSearch">{t("itmSearchLabel")}</Label>
              <div className="relative min-w-0">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="itemSearch"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("itmSearchPlaceholder")}
                  className="min-h-[44px] w-full pl-11 text-base"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <div />
          )}
          <Button
            type="button"
            className="min-h-[44px] px-6 py-3 text-base"
            onClick={openAdd}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {t("itmAdd")}
          </Button>
        </div>

        {items.length === 0 ? (
          <Empty className="border border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Shapes aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-xl">{t("itmEmptyTitle")}</EmptyTitle>
              <EmptyDescription className="text-base leading-relaxed">
                {t("itmEmptyBody")}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              className="min-h-[44px] px-6 py-3 text-base"
              onClick={openAdd}
            >
              <Plus data-icon="inline-start" aria-hidden />
              {t("itmAdd")}
            </Button>
          </Empty>
        ) : shown.length === 0 ? (
          <Empty className="border border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-xl">{t("itmNoMatchTitle")}</EmptyTitle>
              <EmptyDescription className="text-base leading-relaxed">
                {t("itmNoMatchBody")}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] px-6 py-3 text-base"
              onClick={() => setQuery("")}
            >
              {t("itmClearSearch")}
            </Button>
          </Empty>
        ) : (
          <>
            {/* Live: the count is the only thing that answers "did my typing
                do anything?", and it changes with no focus moving to it. */}
            {showSearch ? (
              <p className="text-base text-muted-foreground" aria-live="polite">
                {t("itmCountShown", { shown: shown.length, total: items.length })}
              </p>
            ) : null}
            {/* Its own scroller: the page itself must never scroll sideways. */}
            <div className="w-full overflow-x-auto rounded-xl border border-border">
              <Table aria-label={t("a11yItemsTableLabel")}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t("itmColName")}</TableHead>
                    <TableHead scope="col">{t("itmColCode")}</TableHead>
                    <TableHead scope="col">{t("itmColRate")}</TableHead>
                    <TableHead className="w-40" scope="col">
                      {t("itmColActions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((item) => (
                    <TableRow
                      key={item.id}
                      className="transition-colors hover:bg-surface-2"
                    >
                      {/* The row IS the item, so its name is the row's header
                          cell — a screen reader then reads "Bolt, rate ₹4"
                          instead of a bare "₹4" three cells in. */}
                      <TableHead
                        scope="row"
                        className="h-auto p-4 font-medium text-base text-foreground"
                      >
                        <div className="flex flex-col items-start gap-2">
                          <span>{item.name}</span>
                          {isStockRow(item) ? (
                            <Badge variant="outline">
                              <PackageSearch
                                data-icon="inline-start"
                                aria-hidden
                              />
                              {t("rateFromStockBadge")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableHead>
                      <TableCell className="text-base text-muted-foreground">
                        {item.code ?? "—"}
                      </TableCell>
                      <TableCell>
                        {item.rate === null ? (
                          // `rate == null` is what the picker keys off, so this
                          // row is genuinely unpayable — say so, and make the
                          // fix the button right next to it.
                          <div className="flex flex-col items-start gap-2">
                            <Badge variant="warning">
                              {t("itmNoRateBadge")}
                            </Badge>
                            <span className="text-sm leading-relaxed text-muted-foreground">
                              {t("itmNoRateHelp")}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-[44px] px-4 py-3 text-base"
                              onClick={() => openEdit(item)}
                            >
                              <IndianRupee data-icon="inline-start" aria-hidden />
                              {t("itmSetRate")}
                            </Button>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap text-base font-semibold tabular-nums text-foreground">
                            {t("itmRateValue", {
                              amount: rateFormat.format(item.rate),
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-[44px] px-4 py-3 text-base"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil data-icon="inline-start" aria-hidden />
                            {isStockRow(item) ? t("itmSetRate") : t("itmEdit")}
                          </Button>
                          {/* A stock row has no `items` row to delete, and
                              deleting the stock item itself belongs to the
                              Stock screen — so this row is priced here, and
                              removed there. */}
                          {isStockRow(item) ? null : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="size-11"
                                title={t("itmDelete")}
                                aria-label={t("itmDeleteTitle")}
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("itmDeleteTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("itmDeleteDesc", { name: item.name })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("commonCancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDelete(item)}
                                >
                                  {t("commonDelete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Mounted only while open, and keyed by the row being changed, so its
            boxes are seeded from the stored values every single time. */}
        {editorOpen ? (
          <ItemEditorDialog
            key={editing?.id ?? "new"}
            item={editing}
            onOpenChange={setEditorOpen}
            onSave={handleSave}
          />
        ) : null}
      </main>
    </AppShell>
  );
}
