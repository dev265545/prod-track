"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { SettingsSection } from "./shared";

export type HolidayRow = { id: string; date: string; name?: string };

/**
 * Factory closures and operator-only national holidays are the same entity —
 * "a date nobody works" — so they share one component instead of two
 * near-identical 130-line blocks.
 */
export function HolidayListCard({
  icon,
  title,
  description,
  rows,
  nameOptions,
  otherOptionValue,
  onAdd,
  onDelete,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  rows: HolidayRow[];
  /** When present the holiday also carries a name, chosen from this list. */
  nameOptions?: readonly string[];
  otherOptionValue?: string;
  onAdd: (date: string, name?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const named = Boolean(nameOptions && otherOptionValue);
  const [date, setDate] = React.useState("");
  const [nameChoice, setNameChoice] = React.useState(nameOptions?.[0] ?? "");
  const [customName, setCustomName] = React.useState("");

  const sorted = React.useMemo(
    () => [...rows].sort((a, b) => a.date.localeCompare(b.date)),
    [rows],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date.trim()) return;
    let name: string | undefined;
    if (named) {
      name = nameChoice === otherOptionValue ? customName.trim() : nameChoice;
      if (!name) return;
    }
    try {
      await onAdd(date.trim(), name);
      setDate("");
      setCustomName("");
      setNameChoice(nameOptions?.[0] ?? "");
      toast.success(t("settingsHolidayAddSuccess"));
    } catch {
      toast.error(t("settingsHolidayAddFail"));
    }
  };

  return (
    <SettingsSection icon={icon} title={title} description={description}>
      <p className="text-sm font-medium text-muted-foreground">
        {t("setgCalCount", { count: rows.length })}
      </p>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-base text-muted-foreground">
          {t("setgCalEmpty")}
        </p>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-3">
                <TableHead>{t("settingsHolidayColDate")}</TableHead>
                {named && (
                  <TableHead>{t("settingsOperatorHolidayColName")}</TableHead>
                )}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {h.date}
                  </TableCell>
                  {named && <TableCell>{h.name}</TableCell>}
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="size-11"
                          title={t("settingsHolidayDeleteTitle")}
                          aria-label={t("settingsHolidayDeleteAria", {
                            date: h.date,
                          })}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("settingsHolidayDeleteTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("settingsHolidayDeleteDesc", { date: h.date })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("commonCancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              try {
                                await onDelete(h.id);
                                toast.success(
                                  t("settingsHolidayDeleteSuccess"),
                                );
                              } catch {
                                toast.error(t("settingsHolidayDeleteFail"));
                              }
                            }}
                          >
                            {t("commonDelete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface-2 p-4"
        onSubmit={submit}
      >
        {named && (
          <>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={`${title}-name`} className="text-base">
                {t("settingsOperatorHolidayColName")}
              </Label>
              <Select value={nameChoice} onValueChange={setNameChoice}>
                <SelectTrigger
                  id={`${title}-name`}
                  className="min-h-[44px] w-full min-w-[12rem] sm:w-56"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nameOptions?.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  <SelectItem value={otherOptionValue as string}>
                    {t("settingsOperatorHolidayOther")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {nameChoice === otherOptionValue && (
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={`${title}-custom`} className="text-base">
                  {t("settingsOperatorHolidayCustomNameLabel")}
                </Label>
                <Input
                  id={`${title}-custom`}
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="min-h-[44px] w-full min-w-[12rem] sm:w-56"
                  required
                />
              </div>
            )}
          </>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${title}-date`} className="text-base">
            {t("settingsHolidayAddLabel")}
          </Label>
          <DatePicker
            id={`${title}-date`}
            value={date}
            onChange={setDate}
            placeholder={t("settingsHolidayDatePlaceholder")}
            className="min-h-[44px] w-full min-w-[11rem] sm:w-48"
          />
        </div>
        <Button type="submit" className="min-h-[44px] px-6 text-base">
          <Plus className="size-5" aria-hidden />
          {t("settingsHolidayAddButton")}
        </Button>
      </form>
    </SettingsSection>
  );
}
