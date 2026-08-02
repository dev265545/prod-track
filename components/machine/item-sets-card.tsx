"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Boxes, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import {
  deleteItemCombo,
  saveItemCombo,
  type ItemCombo,
  type ItemComboComponent,
} from "@/lib/services/itemComboService";

export interface ItemSetsCardProps {
  combos: ItemCombo[];
  items: Record<string, unknown>[];
  itemNameById: Record<string, string>;
  onChanged: () => void | Promise<void>;
}

const EMPTY_PART: ItemComboComponent = { itemId: "", ratio: 1 };

/** The item-set list and the "add a set" form. Records only — no maths. */
export function ItemSetsCard({
  combos,
  items,
  itemNameById,
  onChanged,
}: ItemSetsCardProps) {
  const { t } = useLanguage();
  const [name, setName] = React.useState("");
  const [parts, setParts] = React.useState<ItemComboComponent[]>([EMPTY_PART]);

  function updatePart(index: number, patch: Partial<ItemComboComponent>) {
    setParts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const chosen = parts.filter((c) => c.itemId);
    if (chosen.length === 0) return;
    try {
      await saveItemCombo({ name: name.trim(), components: chosen });
      setName("");
      setParts([EMPTY_PART]);
      await onChanged();
      toast.success(t("comboAddSuccess"));
    } catch {
      toast.error(t("comboAddFail"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteItemCombo(id);
      await onChanged();
      toast.success(t("comboDeleteSuccess"));
    } catch {
      toast.error(t("comboDeleteFail"));
    }
  }

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-surface-2 pb-6">
        <CardTitle className="flex items-center gap-2 font-heading text-xl font-semibold">
          <Boxes className="size-5 text-primary" aria-hidden />
          {t("comboCardTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("comboCardSubtitle")}</p>
      </CardHeader>
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 w-full min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("comboColName")}</TableHead>
                <TableHead>{t("comboColComponents")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {combos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="p-0">
                    {/* A real empty state. This used to draw a Skeleton bar,
                        so "nothing here yet" was indistinguishable from
                        "still loading". */}
                    <Empty className="border-0 py-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Boxes aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle>{t("ux3ComboEmptyTitle")}</EmptyTitle>
                        <EmptyDescription>{t("comboEmptyHint")}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                combos.map((c) => (
                  <TableRow
                    key={c.id}
                    className="transition-colors hover:bg-surface-2"
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.components
                        .map(
                          (part) =>
                            `${itemNameById[part.itemId] ?? part.itemId} × ${part.ratio}`,
                        )
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="size-11"
                            title={t("comboDeleteTitle")}
                            aria-label={t("comboDeleteAria", { name: c.name })}
                          >
                            <Trash2 data-icon="inline-start" aria-hidden />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("comboDeleteTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("comboDeleteDesc", { name: c.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t("commonCancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleDelete(c.id)}
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
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2 p-4 sm:p-5"
          onSubmit={handleAdd}
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="comboName">{t("comboFormNameLabel")}</Label>
              <Input
                id="comboName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("comboFormNamePlaceholder")}
                className="min-h-[44px] w-56 max-w-full"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Label>{t("comboFormComponentsLabel")}</Label>
            {parts.map((part, index) => (
              <div key={index} className="flex flex-wrap items-end gap-3">
                <Select
                  value={part.itemId}
                  onValueChange={(v) => updatePart(index, { itemId: v })}
                >
                  <SelectTrigger className="min-h-[44px] w-56 max-w-full">
                    <SelectValue placeholder={t("selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.id as string} value={i.id as string}>
                        {i.name as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NumberInput
                  decimal
                  min={0.01}
                  value={part.ratio}
                  onChange={(e) =>
                    updatePart(index, {
                      ratio: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="min-h-[44px] w-28 max-w-full"
                  placeholder={t("comboFormRatioLabel")}
                  aria-label={t("comboFormRatioLabel")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-[44px] min-w-[44px]"
                  disabled={parts.length <= 1}
                  title={t("commonDelete")}
                  aria-label={t("commonDelete")}
                  onClick={() =>
                    setParts((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-5" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-fit"
              onClick={() => setParts((prev) => [...prev, { ...EMPTY_PART }])}
            >
              <Plus data-icon="inline-start" className="size-5" aria-hidden />
              {t("comboFormAddComponent")}
            </Button>
          </div>
          <Button type="submit" className="min-h-[44px] w-fit px-6 py-3 text-base">
            <Plus data-icon="inline-start" className="size-5" aria-hidden />
            {t("comboFormSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
