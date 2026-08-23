"use client";

import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/language-provider";
import type {
  InventoryCategory,
  InventoryItem,
} from "@/lib/services/inventoryService";
import type { MessageKey } from "@/lib/i18n/messages";

const NONE = "__none__";

interface ItemCodePickerProps {
  id: string;
  labelKey: MessageKey;
  /** Only items in this category are offered. */
  category: InventoryCategory;
  items: InventoryItem[];
  /** The stored item code, or "" when nothing is linked. */
  value: string;
  onChange: (code: string) => void;
}

/**
 * Picks a real item code instead of letting the operator type one. A typed
 * code that does not match an item silently disables the automatic stock
 * deduction, so free text is never offered — but an already-stored unknown
 * code is kept selectable and flagged, so editing an item cannot quietly
 * throw it away.
 */
export function ItemCodePicker({
  id,
  labelKey,
  category,
  items,
  value,
  onChange,
}: ItemCodePickerProps) {
  const { t } = useLanguage();

  const options = items
    .filter((i) => i.category === category && i.isActive !== false)
    .sort((a, b) => a.code.localeCompare(b.code));

  const trimmed = value.trim();
  const isUnknown =
    trimmed !== "" &&
    !items.some((i) => i.code.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <Select
        value={trimmed === "" ? NONE : trimmed}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
      >
        <SelectTrigger id={id} className="h-11 min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("invDlgPartNone")}</SelectItem>
          {isUnknown && (
            <SelectItem value={trimmed}>
              {t("invDlgPartKeepMissing", { code: trimmed })}
            </SelectItem>
          )}
          {options.map((i) => (
            <SelectItem key={i.id} value={i.code}>
              {i.code} — {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isUnknown && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            {t("invDlgPartMissing", { code: trimmed })}
          </span>
        </p>
      )}
      {!isUnknown && options.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t("invDlgPartEmptyList")}
        </p>
      )}
    </div>
  );
}
