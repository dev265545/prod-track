"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useEntryDate } from "@/components/inventory/forms/entry-date";
import {
  produceFinishedGood,
  ProduceError,
  BOM_ROLE_MESSAGE_KEY,
  type InventoryItem,
  type MissingComponent,
} from "@/lib/services/inventoryService";

/** "poly PL9, box B7" — names the components that resolved to no item. */
export function describeMissingComponents(
  missing: MissingComponent[],
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  return missing
    .map((m) => `${t(BOM_ROLE_MESSAGE_KEY[m.role])} ${m.code}`)
    .join(", ");
}

interface ProduceFormProps {
  /** Kept in sync with the surrounding dialog so date/quantity reset on open. */
  active: boolean;
  item: InventoryItem | null;
  onSaved: () => Promise<void> | void;
  /** Called after a save that should close the surrounding dialog. */
  onDone?: () => void;
  /** Render a Cancel button alongside the save buttons. */
  onCancel?: () => void;
  idPrefix?: string;
}

/**
 * The "what did we make" entry form. Shared by the standalone produce dialog
 * and the item details dialog, so recording production is one step from the
 * item instead of a dialog stacked on a dialog.
 */
export function ProduceForm({
  active,
  item,
  onSaved,
  onDone,
  onCancel,
  idPrefix = "prod",
}: ProduceFormProps) {
  const { t } = useLanguage();
  const { date, setDate, isRemembered } = useEntryDate(active);
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const qtyRef = useRef<HTMLInputElement>(null);

  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) {
      setQty("");
      setSavedCount(0);
    }
  }

  const parts = [
    item?.boxCode ? t("invDlgPartBoxShort") : null,
    item?.stickerCode ? t("invDlgPartStickerShort") : null,
    item?.polyCode ? t("invDlgPartPolyShort") : null,
  ].filter((p): p is string => p !== null);

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
      const result = await produceFinishedGood(item.id, qtyNumber, date);
      toast.success(t("invDlgMadeSaved", { qty: qtyNumber, name: item.name }));
      // The finished good was recorded, but one or more packing components
      // resolved to no item, so their stock was NOT drawn down. Say so.
      if (result.missing.length > 0) {
        toast.warning(
          t("invSvcNotDeducted", {
            parts: describeMissingComponents(result.missing, t),
          }),
          { duration: 10000 },
        );
      }
      await onSaved();
      if (keepOpen) {
        setSavedCount((n) => n + 1);
        setQty("");
        qtyRef.current?.focus();
      } else {
        onDone?.();
      }
    } catch (err) {
      console.error("Failed to record production", err);
      if (err instanceof ProduceError) {
        toast.error(
          t(err.code === "invalid-qty" ? "invSvcQtyPositive" : "invSvcItemMissing"),
        );
      } else {
        toast.error(t("invDlgMadeFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      className="flex min-w-0 flex-col gap-4"
    >
      <p className="text-sm text-muted-foreground">
        {parts.length > 0
          ? t("invDlgMadeExplain", { parts: parts.join(", ") })
          : t("invDlgMadeNoParts")}
      </p>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${idPrefix}-qty`} className="text-base">
          {t("invDlgMadeQtyLabel")}
        </Label>
        <NumberInput
          id={`${idPrefix}-qty`}
          ref={qtyRef}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-14 text-2xl font-semibold tabular-nums"
          required
          autoFocus
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${idPrefix}-date`}>{t("invDlgDateLabel")}</Label>
        <DatePicker id={`${idPrefix}-date`} value={date} onChange={setDate} />
        {isRemembered && (
          <p className="text-xs text-muted-foreground">
            {t("invDlgDateRemembered")}
          </p>
        )}
      </div>

      {savedCount > 0 && (
        <p className="rounded-lg bg-surface-3 px-3 py-2 text-sm text-muted-foreground">
          {t("invDlgSavedSoFar", { count: savedCount })}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={onCancel}
            disabled={saving}
          >
            {t("commonCancel")}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full sm:w-auto"
          onClick={() => void save(true)}
          disabled={saving}
        >
          {t("invDlgSaveAnother")}
        </Button>
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving}>
          {saving && (
            <Loader2
              data-icon="inline-start"
              className="animate-spin"
              aria-hidden
            />
          )}
          {saving ? t("invDlgSaving") : t("invDlgSaveClose")}
        </Button>
      </div>
    </form>
  );
}
