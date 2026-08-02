"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { describeMissingComponents } from "@/components/inventory/forms/produce-form";
import { saveProductionEntry } from "@/lib/services/productionEntryService";
import {
  resolveSaveTarget,
  type ProductionCatalogEntry,
} from "@/lib/services/productionCatalog";

/**
 * The one place work gets written down.
 *
 * `saveProductionEntry` — never the raw `saveProduction` — so recording output
 * also draws down the material it consumed, and rolls the production line back
 * if that draw-down fails. The two can therefore never disagree.
 *
 * The form is built for *repetition*: the day is chosen by the screen above and
 * never re-asked, who and what stay selected after a save, and focus returns to
 * the quantity box so the next line is one number and one Enter away.
 */

export interface EntryOption {
  id: string;
  name: string;
}

interface ProductionEntryFormProps {
  /** Chosen once by the page; the form never asks for it. */
  date: string;
  employees: EntryOption[];
  /**
   * What can be made, already resolved from whichever list the
   * production/stock connection says to use. Entries carry their own rate, so
   * an unpriced item can be refused here instead of silently saving work
   * worth nothing.
   */
  items: ProductionCatalogEntry[];
  /** Refresh the roster and totals after a successful save. */
  onSaved: () => Promise<void> | void;
  /** Blocks saving on a factory holiday until the page unlocks it. */
  disabled?: boolean;
}

export interface ProductionEntryFormHandle {
  /** Select a person and put the cursor where the operator can start typing. */
  focusFor: (employeeId: string) => void;
}

const SHIFTS = [
  { value: "day" as const, labelKey: "shiftDay" as const, icon: Sun },
  { value: "night" as const, labelKey: "shiftNight" as const, icon: Moon },
];

export const ProductionEntryForm = React.forwardRef<
  ProductionEntryFormHandle,
  ProductionEntryFormProps
>(function ProductionEntryForm(
  { date, employees, items, onSaved, disabled },
  ref,
) {
  const { t } = useLanguage();

  // Who and what stay selected across saves: the same person usually makes
  // several lines in a row, and re-picking them each time is the whole cost the
  // old quick-add imposed.
  const [employee, setEmployee] = React.useState("");
  const [item, setItem] = React.useState("");
  const [shift, setShift] = React.useState<"day" | "night">("day");
  // Held as text so the box can be emptied between lines; "0" would look like a
  // real answer the operator has to clear before typing.
  const [qty, setQty] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedCount, setSavedCount] = React.useState(0);

  const qtyRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(ref, () => ({
    focusFor(nextEmployeeId: string) {
      setEmployee(nextEmployeeId);
      qtyRef.current?.focus();
    },
  }));

  // A new day is a new sitting, so the "written down just now" tally restarts.
  React.useEffect(() => {
    setSavedCount(0);
  }, [date]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || saving) return;
    if (!employee) {
      toast.error(t("prodNeedWho"));
      return;
    }
    if (!item) {
      toast.error(t("prodNeedWhat"));
      return;
    }
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error(t("prodNeedHowMany"));
      qtyRef.current?.focus();
      return;
    }

    const selected = items.find((i) => i.id === item);
    if (!selected) {
      toast.error(t("prodNeedWhat"));
      return;
    }
    // Pay is quantity x rate. Saving an item nothing prices would look like a
    // successful entry and pay the worker zero, so it is refused out loud.
    if (selected.rate == null) {
      toast.error(t("cfgNoRate", { item: selected.name }), { duration: 10000 });
      return;
    }

    setSaving(true);
    try {
      // A stock item picked for the first time has no row in the pay list yet;
      // this creates it, at the rate shown, and remembers the pairing.
      const target = await resolveSaveTarget(selected);
      if (!target.ok) {
        toast.error(t("cfgNoRate", { item: selected.name }), { duration: 10000 });
        return;
      }
      const { inventory } = await saveProductionEntry({
        employeeId: employee,
        itemId: target.legacyItemId,
        inventoryItemId: target.inventoryItemId,
        date,
        quantity,
        shift,
      });
      setSavedCount((n) => n + 1);
      setQty("");
      toast.success(
        t("prodSavedToast", {
          qty: quantity,
          item: items.find((i) => i.id === item)?.name ?? "",
          name: employees.find((e) => e.id === employee)?.name ?? "",
        }),
      );
      // The work was saved, but these materials matched no stock item, so
      // nothing was taken out for them. Long toast: it needs a human decision.
      // `inventory` is null when the item is not in the stock list at all —
      // an ordinary case, not a failure, and nothing to warn about.
      if (inventory && inventory.missing.length > 0) {
        toast.warning(
          t("invSvcNotDeducted", {
            parts: describeMissingComponents(inventory.missing, t),
          }),
          { duration: 10000 },
        );
      }
      await onSaved();
    } catch (error) {
      console.error("[production] entry failed", { employee, item, date }, error);
      toast.error(t("prodSaveFailed"));
    } finally {
      setSaving(false);
      // Straight back to the number box, whether it worked or not.
      qtyRef.current?.focus();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="prod-who">{t("prodWhoLabel")}</Label>
          <Select value={employee} onValueChange={setEmployee}>
            <SelectTrigger id="prod-who" className="min-h-[44px] w-full">
              <SelectValue placeholder={t("selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="prod-what">{t("prodWhatLabel")}</Label>
          <Select value={item} onValueChange={setItem}>
            <SelectTrigger id="prod-what" className="min-h-[44px] w-full">
              <SelectValue placeholder={t("selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.code ? `${i.name} (${i.code})` : i.name}
                  {i.rate == null ? ` \u2014 ${t("cfgRateMissingBadge")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-foreground">
            {t("prodShiftLabel")}
          </legend>
          <div className="flex min-w-0 flex-wrap gap-2">
            {SHIFTS.map(({ value, labelKey, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={shift === value ? "default" : "outline"}
                aria-pressed={shift === value}
                onClick={() => setShift(value)}
                className="min-h-[44px] min-w-0 flex-1 px-4"
              >
                <Icon data-icon="inline-start" className="size-4" aria-hidden />
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="prod-how-many">{t("prodHowManyLabel")}</Label>
          {/* Autofocused and Enter-submitting: the only field that changes
              between two lines for the same person. */}
          <NumberInput
            ref={qtyRef}
            id="prod-how-many"
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="min-h-[44px] w-full text-lg tabular-nums"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="submit"
          disabled={saving || disabled}
          className="min-h-[52px] min-w-0 flex-1 px-6 text-base font-semibold sm:flex-none"
        >
          {saving ? (
            <>
              <Spinner data-icon="inline-start" />
              {t("prodSaving")}
            </>
          ) : (
            <>
              <Check data-icon="inline-start" className="size-5" aria-hidden />
              {t("prodSaveAndNext")}
            </>
          )}
        </Button>
        <p
          aria-live="polite"
          className={cn(
            "min-w-0 text-sm text-muted-foreground",
            savedCount === 0 && "sr-only",
          )}
        >
          {t("prodSessionCount", { count: savedCount })}
        </p>
      </div>
    </form>
  );
});
