"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import {
  getMovementsForItem,
  deleteMovement,
  type InventoryItem,
  type InventoryMovement,
} from "@/lib/services/inventoryService";

interface HistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  onChanged: () => Promise<void> | void;
}

export function HistorySheet({
  open,
  onOpenChange,
  item,
  onChanged,
}: HistorySheetProps) {
  const { t } = useLanguage();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<InventoryMovement | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    getMovementsForItem(item.id)
      .then((list) => {
        if (cancelled) return;
        list.sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
        );
        setMovements(list);
      })
      .catch((err) => {
        console.error("Failed to load movement history", err);
        toast.error(t("invDlgHistoryLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, item, refreshKey, t]);

  const moveTypeLabel = (type: InventoryMovement["type"]) => {
    if (type === "inward") return t("invDlgTypeIn");
    if (type === "outward") return t("invDlgTypeOut");
    return t("invDlgTypeFix");
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteMovement(deleteTarget.id);
      toast.success(t("invDlgHistoryDeleted"));
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
      await onChanged();
    } catch (err) {
      console.error("Failed to delete movement", err);
      toast.error(t("invDlgHistoryDeleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <div className="flex min-w-0 flex-col gap-1 pb-4">
            <h2 className="text-lg font-semibold">
              {t("inventoryMovementHistory")}
            </h2>
            <p className="break-words text-sm text-muted-foreground">
              {item?.name} · {item?.code}
            </p>
          </div>
          {movements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("inventoryNoMovements")}
            </p>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("invDlgDateLabel")}</TableHead>
                    <TableHead>{t("invDlgTypeColumn")}</TableHead>
                    <TableHead className="text-right">
                      {t("invDlgQtyColumn")}
                    </TableHead>
                    <TableHead>{t("invDlgNoteLabel")}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">
                        {m.date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {moveTypeLabel(m.type)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.qty}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground">
                        {m.note}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          onClick={() => setDeleteTarget(m)}
                          aria-label={t("invDlgHistoryDeleteTitle")}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(next) => {
          if (!next && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invDlgHistoryDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("invDlgHistoryDeleteBody", {
                    type: moveTypeLabel(deleteTarget.type),
                    qty: deleteTarget.qty,
                    date: deleteTarget.date,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11" disabled={deleting}>
              {t("commonCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting && (
                <Loader2
                  data-icon="inline-start"
                  className="mr-2 size-4 animate-spin"
                  aria-hidden
                />
              )}
              {t("invDlgHistoryDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
