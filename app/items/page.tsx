"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
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

export default function ItemsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [itemName, setItemName] = useState("");
  const [itemRate, setItemRate] = useState(0);

  const load = async () => {
    const list = await getItems();
    setItems(list);
  };

  useEffect(() => {
    openDB()
      .then(async () => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        await load();
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <AppLoadingScreen
        title="Opening items…"
        description="Loading packaging item groups from your database."
      />
    );
  }

  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";

  return (
    <AppShell>
      <main className="flex flex-col gap-10 animate-fade-in">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Packaging items
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            Define packaging item groups and rates. They appear when adding
            production and in reports.
          </p>
        </header>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Package className="size-5 text-primary" />
              All packaging item groups
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Names and prices used for daily production and payroll.
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Packaging item group</TableHead>
                    <TableHead className="text-right tabular-nums">
                      Packaging price (₹)
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center">
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Skeleton className="h-4 w-48 rounded-md" />
                          <span className="text-sm text-muted-foreground">
                            No items yet — add your first group below.
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
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                title="Delete packaging item group"
                                aria-label="Delete packaging item group"
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete packaging item group?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete {i.name as string}? Productions using
                                  it will keep the id but may show as unknown.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await deleteItem(i.id as string);
                                      await load();
                                      toast.success(
                                        "Packaging item group deleted",
                                      );
                                    } catch {
                                      toast.error(
                                        "Failed to delete packaging item group",
                                      );
                                    }
                                  }}
                                >
                                  Delete
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
                  });
                  setItemName("");
                  setItemRate(0);
                  await load();
                  toast.success("Packaging item group added");
                } catch {
                  toast.error("Failed to add packaging item group");
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemName">Packaging item group name</Label>
                <Input
                  id="itemName"
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. RD CONT - 1000PCS"
                  className="w-64 min-h-[44px]"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemRate">Packaging price (₹)</Label>
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
              <Button type="submit" className={btnPrimaryClass}>
                Add packaging item group
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
