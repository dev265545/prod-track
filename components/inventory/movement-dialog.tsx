"use client";

import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useEntryDate } from "@/components/inventory/forms/entry-date";
import {
  addMovement,
  type InventoryItem,
  type MovementType,
} from "@/lib/services/inventoryService";

interface MovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  type: MovementType;
  onSaved: () => Promise<void> | void;
}

export function MovementDialog({
  open,
  onOpenChange,
  item,
  type,
  onSaved,
}: MovementDialogProps) {
  const { t } = useLanguage();
  const { date, setDate, isRemembered } = useEntryDate(open);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const qtyRef = useRef<HTMLInputElement>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQty("");
      setNote("");
      setSavedCount(0);
    }
  }

  const titleKey =
    type === "inward"
      ? "invDlgStockInTitle"
      : type === "outward"
        ? "invDlgStockOutTitle"
        : "invDlgAdjustTitle";
  const Icon =
    type === "inward"
      ? ArrowDownToLine
      : type === "outward"
        ? ArrowUpFromLine
        : SlidersHorizontal;

  const qtyNumber = parseFloat(qty);
  const qtyValid = Number.isFinite(qtyNumber) && qtyNumber > 0;

  const save = async (keepOpen: boolean) => {
    if (!item || saving) return;
    if (!qtyValid) {
      toast.error(t("invDlgQtyRequired"));
      qtyRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      await addMovement({
        itemId: item.id,
        date,
        type,
        qty: qtyNumber,
        note: note.trim() || undefined,
      });
      toast.success(
        t(type === "outward" ? "invDlgSavedOut" : "invDlgSavedIn", {
          qty: qtyNumber,
          name: item.name,
        }),
      );
      await onSaved();
      if (keepOpen) {
        setSavedCount((n) => n + 1);
        setQty("");
        setNote("");
        qtyRef.current?.focus();
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      console.error("Failed to record inventory movement", err);
      toast.error(t("invDlgSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[var(--dialog-max-h)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{t(titleKey)}</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            {item?.name} · {item?.code}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="mv-qty" className="text-base">
              {t(item?.unit === "kg" ? "invDlgQtyKg" : "invDlgQtyPieces")}
            </Label>
            <NumberInput
              id="mv-qty"
              ref={qtyRef}
              decimal
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-14 text-2xl font-semibold tabular-nums"
              required
              autoFocus
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="mv-date">{t("invDlgDateLabel")}</Label>
            <DatePicker id="mv-date" value={date} onChange={setDate} />
            {isRemembered && (
              <p className="text-xs text-muted-foreground">
                {t("invDlgDateRemembered")}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="mv-note">{t("invDlgNoteLabel")}</Label>
            <Input
              id="mv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("invDlgNotePlaceholder")}
              className="h-11"
            />
          </div>

          {savedCount > 0 && (
            <p className="rounded-lg bg-surface-3 px-3 py-2 text-sm text-muted-foreground">
              {t("invDlgSavedSoFar", { count: savedCount })}
            </p>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:space-x-0 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("commonCancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full sm:w-auto"
              onClick={() => void save(true)}
              disabled={saving}
            >
              {t("invDlgSaveAnother")}
            </Button>
            <Button
              type="submit"
              className="h-11 w-full sm:w-auto"
              disabled={saving}
            >
              {saving && (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden
                />
              )}
              {saving ? t("invDlgSaving") : t("invDlgSaveClose")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
