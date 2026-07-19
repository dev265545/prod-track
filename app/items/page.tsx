"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Trash2 } from "lucide-react";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { getItems, saveItem, deleteItem } from "@/lib/services/itemService";
import { toast } from "sonner";
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
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useLanguage } from "@/components/language-provider";

export default function ItemsPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const [dataLoaded, setDataLoaded] = useState(false);
  const ready = guardReady && dataLoaded;
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [itemName, setItemName] = useState("");
  const [itemRate, setItemRate] = useState(0);
  const [itemStock, setItemStock] = useState(0);

  const load = async () => {
    const list = await getItems();
    setItems(list);
  };

  useEffect(() => {
    if (!guardReady) return;
    load().then(() => setDataLoaded(true));
  }, [guardReady]);

  if (!ready) {
    return (
      <AppLoadingScreen
        title={t("loadingOpeningItems")}
        description={t("loadingOpeningItemsDesc")}
      />
    );
  }

  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";

  return (
    <AppShell>
      <main className="flex flex-col gap-10 animate-fade-in">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("itemsPageTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("itemsPageIntro")}
          </p>
        </header>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Package className="size-5 text-primary" />
              {t("itemsCardTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("itemsCardSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("itemsColGroup")}</TableHead>
                    <TableHead className="text-right tabular-nums">
                      {t("itemsColPrice")}
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      {t("itemsColStock")}
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Skeleton className="h-4 w-48 rounded-md" />
                          <span className="text-sm text-muted-foreground">
                            {t("itemsEmptyHint")}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((i) => (
                      <TableRow
                        key={i.id as string}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="font-medium">
                          {i.name as string}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.rate as number}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={(i.stock as number) ?? 0}
                            aria-label={t("itemsFormStockLabel")}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === i.id ? { ...it, stock: v } : it,
                                ),
                              );
                            }}
                            onBlur={async (e) => {
                              const v = parseFloat(e.target.value) || 0;
                              try {
                                await saveItem({ ...i, stock: v });
                                toast.success(t("itemsStockUpdateSuccess"));
                              } catch {
                                toast.error(t("itemsStockUpdateFail"));
                                await load();
                              }
                            }}
                            className="w-24 min-h-[36px] text-right ml-auto"
                          />
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                title={t("itemsDeleteTitle")}
                                aria-label={t("itemsDeleteGroupAria")}
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("itemsDeleteTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("itemsDeleteDesc", {
                                    name: String(i.name),
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await deleteItem(i.id as string);
                                      await load();
                                      toast.success(
                                        t("itemsDeleteSuccess"),
                                      );
                                    } catch {
                                      toast.error(
                                        t("itemsDeleteFail"),
                                      );
                                    }
                                  }}
                                >
                                  {t("commonDelete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <form
              className="flex flex-wrap gap-4 items-end rounded-xl border border-border/60 bg-muted/15 p-4 sm:p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!itemName.trim()) return;
                try {
                  await saveItem({
                    name: itemName.trim(),
                    rate: itemRate,
                    stock: itemStock,
                  });
                  setItemName("");
                  setItemRate(0);
                  setItemStock(0);
                  await load();
                  toast.success(t("itemsAddSuccess"));
                } catch {
                  toast.error(t("itemsAddFail"));
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemName">{t("itemsFormNameLabel")}</Label>
                <Input
                  id="itemName"
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder={t("itemsFormNamePlaceholder")}
                  className="w-64 min-h-[44px]"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemRate">{t("itemsFormRateLabel")}</Label>
                <Input
                  id="itemRate"
                  type="number"
                  min={0}
                  step={0.01}
                  value={itemRate}
                  onChange={(e) =>
                    setItemRate(parseFloat(e.target.value) || 0)
                  }
                  className="w-28 min-h-[44px]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemStock">{t("itemsFormStockLabel")}</Label>
                <Input
                  id="itemStock"
                  type="number"
                  min={0}
                  step={1}
                  value={itemStock}
                  onChange={(e) =>
                    setItemStock(parseFloat(e.target.value) || 0)
                  }
                  className="w-28 min-h-[44px]"
                />
              </div>
              <Button type="submit" className={btnPrimaryClass}>
                {t("itemsFormSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
