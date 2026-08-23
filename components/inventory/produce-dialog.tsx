"use client";

import { Factory } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/components/language-provider";
import { ProduceForm } from "@/components/inventory/forms/produce-form";
import type { InventoryItem } from "@/lib/services/inventoryService";

interface ProduceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  onSaved: () => Promise<void> | void;
}

export function ProduceDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: ProduceDialogProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[var(--dialog-max-h)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Factory className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{t("invDlgMadeTitle")}</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            {item?.name} · {item?.code}
          </DialogDescription>
        </DialogHeader>
        <ProduceForm
          active={open}
          item={item}
          onSaved={onSaved}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
