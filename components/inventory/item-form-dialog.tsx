"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import {
  getInventoryItems,
  saveInventoryItem,
  INVENTORY_CATEGORIES,
  DEFAULT_STICKERS_PER_UNIT,
  stickerCodesFor,
  type InventoryItem,
  type InventoryCategory,
  type InventoryUnit,
} from "@/lib/services/inventoryService";
import { CATEGORY_LABEL_KEY } from "@/components/inventory/shared";
import { ItemCodePicker } from "@/components/inventory/forms/item-code-picker";

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  onSaved: () => Promise<void> | void;
  /** Pre-select and lock the category select (e.g. when adding from a category page). */
  lockCategory?: InventoryCategory;
}

/** Stock level under which the dashboard flags the item as running low. */
const DEFAULT_LOW_STOCK_THRESHOLD = 100;

const emptyForm = {
  code: "",
  name: "",
  category: "box" as InventoryCategory,
  unit: "pcs" as InventoryUnit,
  weightPerUnit: 0,
  lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
  openingStock: 0,
  boxCode: "",
  stickerCode: "",
  /** Optional second sticker (the source workbook's Container column P). */
  stickerCode2: "",
  /** Blank means "use the default"; kept as a string so an empty box does not
   * become 0. */
  stickersPerUnit: "",
  polyCode: "",
};

function buildForm(
  item: InventoryItem | null,
  lockCategory: InventoryCategory | undefined,
): typeof emptyForm {
  if (!item) return { ...emptyForm, category: lockCategory ?? emptyForm.category };
  return {
    code: item.code,
    name: item.name,
    category: item.category,
    unit: item.unit,
    weightPerUnit: item.weightPerUnit ?? 0,
    lowStockThreshold: item.lowStockThreshold,
    openingStock: item.openingStock,
    boxCode: item.boxCode ?? "",
    stickerCode: stickerCodesFor(item)[0] ?? "",
    stickerCode2: stickerCodesFor(item)[1] ?? "",
    stickersPerUnit:
      item.stickersPerUnit === undefined ? "" : String(item.stickersPerUnit),
    polyCode: item.polyCode ?? "",
  };
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
  lockCategory,
}: ItemFormDialogProps) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => buildForm(item, lockCategory));
  const [saving, setSaving] = useState(false);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);

  // Reload the fields whenever the dialog opens or targets a different item.
  const signature = `${open}|${item?.id ?? ""}|${lockCategory ?? ""}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    if (open) setForm(buildForm(item, lockCategory));
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getInventoryItems()
      .then((rows) => {
        if (!cancelled) setAllItems(rows);
      })
      .catch((err) => {
        console.error("Failed to load items for the packing pickers", err);
        toast.error(t("invDlgPartsLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const isFinished =
    INVENTORY_CATEGORIES.find((c) => c.value === form.category)?.layer ===
    "finished";
  const showWeight = form.unit === "kg" || form.category === "poly";
  // Blank stays undefined so the item keeps falling back to the default
  // instead of being pinned to whatever the default happens to be today.
  const trimmedStickers = form.stickersPerUnit.trim();
  const parsedStickers = trimmedStickers === "" ? Number.NaN : Number(trimmedStickers);
  const stickerCodes = [form.stickerCode, form.stickerCode2]
    .map((c) => c.trim())
    .filter((c) => c !== "");
  const parsedStickersPerUnit =
    Number.isFinite(parsedStickers) && parsedStickers >= 0 ? parsedStickers : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast.error(t("invDlgItemFieldsRequired"));
      return;
    }
    setSaving(true);
    try {
      await saveInventoryItem({
        id: item?.id,
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        weightPerUnit: showWeight ? form.weightPerUnit : undefined,
        lowStockThreshold: form.lowStockThreshold,
        openingStock: form.openingStock,
        boxCode: isFinished ? form.boxCode || undefined : undefined,
        stickerCodes: isFinished ? stickerCodes : undefined,
        stickersPerUnit: isFinished ? parsedStickersPerUnit : undefined,
        polyCode: isFinished ? form.polyCode || undefined : undefined,
        sortOrder: item?.sortOrder ?? 0,
        isActive: item?.isActive ?? true,
        createdAt: item?.createdAt,
      });
      toast.success(t("inventoryItemSaved"));
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      console.error("Failed to save inventory item", err);
      toast.error(t("invDlgItemSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? t("inventoryEditItem") : t("inventoryAddItem")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-code">{t("invDlgItemCode")}</Label>
              <Input
                id="inv-code"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
                className="h-11"
                required
                autoFocus
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-name">{t("invDlgItemName")}</Label>
              <Input
                id="inv-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="h-11"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-category">{t("inventoryFormCategory")}</Label>
              <Select
                value={form.category}
                disabled={!item && !!lockCategory}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as InventoryCategory }))
                }
              >
                <SelectTrigger id="inv-category" className="h-11 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {t(CATEGORY_LABEL_KEY[c.value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-unit">{t("invDlgItemCountedIn")}</Label>
              <Select
                value={form.unit}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, unit: v as InventoryUnit }))
                }
              >
                <SelectTrigger id="inv-unit" className="h-11 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">{t("inventoryUnitPcs")}</SelectItem>
                  <SelectItem value="kg">{t("inventoryUnitKg")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showWeight && (
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-weight">{t("inventoryWeightPerUnit")}</Label>
              <NumberInput
                id="inv-weight"
                decimal
                value={form.weightPerUnit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    weightPerUnit: parseFloat(e.target.value) || 0,
                  }))
                }
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {t("invDlgWeightHelp")}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-opening">{t("invDlgOpeningLabel")}</Label>
              <NumberInput
                id="inv-opening"
                decimal
                value={form.openingStock}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    openingStock: parseFloat(e.target.value) || 0,
                  }))
                }
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {t("invDlgOpeningHelp")}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="inv-threshold">{t("invDlgLowLabel")}</Label>
              <NumberInput
                id="inv-threshold"
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    lowStockThreshold: parseFloat(e.target.value) || 0,
                  }))
                }
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {t("invDlgLowHelp")}
              </p>
            </div>
          </div>

          {isFinished && (
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4 shadow-sm">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-semibold">{t("invDlgPartsTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("invDlgPartsHelp")}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <ItemCodePicker
                  id="inv-box"
                  labelKey="invDlgPartBox"
                  category="box"
                  items={allItems}
                  value={form.boxCode}
                  onChange={(code) => setForm((f) => ({ ...f, boxCode: code }))}
                />
                <ItemCodePicker
                  id="inv-sticker"
                  labelKey="invDlgPartSticker"
                  category="sticker"
                  items={allItems}
                  value={form.stickerCode}
                  onChange={(code) =>
                    setForm((f) => ({ ...f, stickerCode: code }))
                  }
                />
                <ItemCodePicker
                  id="inv-sticker-2"
                  labelKey="invSvcSticker2Label"
                  category="sticker"
                  items={allItems}
                  value={form.stickerCode2}
                  onChange={(code) =>
                    setForm((f) => ({ ...f, stickerCode2: code }))
                  }
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="inv-stickers-per-unit">
                    {t("invSvcStickersPerUnitLabel")}
                  </Label>
                  <NumberInput
                    id="inv-stickers-per-unit"
                    value={form.stickersPerUnit}
                    placeholder={String(DEFAULT_STICKERS_PER_UNIT)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stickersPerUnit: e.target.value }))
                    }
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("invSvcStickersPerUnitHint", {
                      count: DEFAULT_STICKERS_PER_UNIT,
                    })}
                  </p>
                </div>
                <ItemCodePicker
                  id="inv-poly"
                  labelKey="invDlgPartPoly"
                  category="poly"
                  items={allItems}
                  value={form.polyCode}
                  onChange={(code) => setForm((f) => ({ ...f, polyCode: code }))}
                />
              </div>
            </div>
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
              {saving ? t("invDlgSaving") : t("inventoryFormSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
