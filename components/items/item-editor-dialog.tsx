"use client";

import * as React from "react";
import { IndianRupee, PackageSearch, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useLanguage } from "@/components/language-provider";
import {
  isStockRow,
  rateToInput,
  validateRate,
  validateStockRate,
  type ItemRow,
} from "@/lib/utils/itemCatalog";

/**
 * Add / change one item.
 *
 * The rate box is the reason this screen exists, so it is the largest field and
 * carries its own explanation rather than a bare label. It is a `NumberInput`
 * (`decimal`) and never a `type="number"`: the raw control accepted letters,
 * reported invalid content back as an empty string, and changed itself on a
 * stray scroll — all of which, on this field, would silently alter pay.
 *
 * Nothing here writes to the database. The dialog hands a clean value to
 * `onSave` and stays open if that rejects, so a failed write can never leave a
 * number on screen that the database does not hold.
 */
export interface ItemDraft {
  name: string;
  code?: string;
  rate: number | null;
}

export function ItemEditorDialog({
  item,
  onOpenChange,
  onSave,
}: {
  /** The item being changed, or `null` when adding a new one. */
  item: ItemRow | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves `true` when the row is safely stored. */
  onSave: (draft: ItemDraft) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  // Seeded once, at mount. The parent mounts this only while the dialog is
  // open and keys it by item, so opening always starts from the stored values
  // and a cancelled edit can never leak into the next one — no effect, and no
  // cascading render on open.
  const [name, setName] = React.useState(item?.name ?? "");
  const [code, setCode] = React.useState(item?.code ?? "");
  const [rate, setRate] = React.useState(rateToInput(item?.rate ?? null));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // A row that came from the stock list is here for one reason: to be given a
  // price. Its name and code belong to the Stock screen and are shown, not
  // edited, so the same item can never end up with two different names.
  const fromStock = item !== null && isStockRow(item);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("itmErrName"));
      return;
    }
    const checked = fromStock ? validateStockRate(rate) : validateRate(rate);
    if (!checked.ok) {
      setError(
        checked.problem === "zero"
          ? t("itmErrRateZero")
          : checked.problem === "negative"
            ? t("itmErrRateNegative")
            : checked.problem === "missing"
              ? t("rateStockNeedAmount")
              : t("itmErrRateInvalid"),
      );
      return;
    }

    setError(null);
    setSaving(true);
    const saved = await onSave({
      name: trimmedName,
      code: code.trim() || undefined,
      rate: checked.rate,
    });
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {fromStock
              ? t("rateStockDialogTitle")
              : item
                ? t("itmEditTitle")
                : t("itmAddTitle")}
          </DialogTitle>
          <DialogDescription>
            {fromStock ? t("rateStockDialogDesc") : t("itmDialogDesc")}
          </DialogDescription>
        </DialogHeader>

        <form className="flex w-full min-w-0 flex-col gap-5" onSubmit={submit}>
          {fromStock ? (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-4 text-base leading-relaxed text-muted-foreground">
              <PackageSearch className="mt-1 size-5 shrink-0" aria-hidden />
              <span>{t("rateStockNameLocked")}</span>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="itemName">{t("itmFieldName")}</Label>
            <Input
              id="itemName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("itmFieldNamePlaceholder")}
              className="min-h-[44px] text-base"
              autoComplete="off"
              readOnly={fromStock}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="itemCode">{t("itmFieldCode")}</Label>
            <Input
              id="itemCode"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("itmFieldCodePlaceholder")}
              className="min-h-[44px] text-base"
              autoComplete="off"
              readOnly={fromStock}
            />
          </div>

          {/* The money field, deliberately given its own panel: it is the one
              number on this screen that decides what somebody is paid. */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
            <Label
              htmlFor="itemRate"
              className="flex items-center gap-2 text-base font-semibold"
            >
              <IndianRupee className="size-5 shrink-0" aria-hidden />
              {t("itmFieldRate")}
            </Label>
            <NumberInput
              id="itemRate"
              decimal
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={t("itmFieldRatePlaceholder")}
              className="max-w-[12rem] text-xl font-semibold tabular-nums"
            />
            <p className="text-base leading-relaxed text-muted-foreground">
              {fromStock ? t("rateStockFieldHelp") : t("itmFieldRateHelp")}
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-border bg-surface-3 p-4 text-base leading-relaxed text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] px-6 py-3 text-base"
              onClick={() => onOpenChange(false)}
            >
              {t("commonCancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-6 py-3 text-base"
            >
              <Save data-icon="inline-start" aria-hidden />
              {t("commonSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
