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
import { Skeleton } from "@/components/ui/skeleton";
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
import { Cog, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import {
  deleteMachine,
  saveMachine,
  type Machine,
} from "@/lib/services/machineService";

export interface MachinesCardProps {
  machines: Machine[];
  /** Re-read the page's data after a machine is added or removed. */
  onChanged: () => void | Promise<void>;
}

/** The machine list and the "add a machine" form. Records only — no maths. */
export function MachinesCard({ machines, onChanged }: MachinesCardProps) {
  const { t } = useLanguage();
  const [name, setName] = React.useState("");
  const [piecesPerShot, setPiecesPerShot] = React.useState(1);
  const [secondsPerShot, setSecondsPerShot] = React.useState(1.0);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await saveMachine({
        name: name.trim(),
        cavities: piecesPerShot,
        cycleTimeSeconds: secondsPerShot,
      });
      setName("");
      setPiecesPerShot(1);
      setSecondsPerShot(1.0);
      await onChanged();
      toast.success(t("machineAddSuccess"));
    } catch {
      toast.error(t("machineAddFail"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMachine(id);
      await onChanged();
      toast.success(t("machineDeleteSuccess"));
    } catch {
      toast.error(t("machineDeleteFail"));
    }
  }

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-surface-2 pb-6">
        <CardTitle className="flex items-center gap-2 font-heading text-xl font-semibold">
          <Cog className="size-5 text-primary" aria-hidden />
          {t("machineCardTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("machineCardSubtitle")}
        </p>
      </CardHeader>
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 w-full min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("machineColName")}</TableHead>
                <TableHead className="text-right tabular-nums">
                  {t("machineColCavities")}
                </TableHead>
                <TableHead className="text-right tabular-nums">
                  {t("machineColCycleTime")}
                </TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Skeleton className="h-4 w-40 rounded-md" />
                      <span className="text-sm text-muted-foreground">
                        {t("machineEmptyHint")}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                machines.map((m) => (
                  <TableRow
                    key={m.id}
                    className="transition-colors hover:bg-surface-2"
                  >
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.cavities}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.cycleTimeSeconds}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            title={t("machineDeleteTitle")}
                            aria-label={t("machineDeleteAria", { name: m.name })}
                          >
                            <Trash2 data-icon="inline-start" aria-hidden />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("machineDeleteTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("machineDeleteDesc", { name: m.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t("commonCancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleDelete(m.id)}
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
          className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface-2 p-4 sm:p-5"
          onSubmit={handleAdd}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="machineName">{t("machineFormNameLabel")}</Label>
            <Input
              id="machineName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("machineFormNamePlaceholder")}
              className="min-h-[44px] w-48 max-w-full"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="machineCavities">
              {t("machineFormCavitiesLabel")}
            </Label>
            <NumberInput
              id="machineCavities"
              min={1}
              value={piecesPerShot}
              onChange={(e) =>
                setPiecesPerShot(parseInt(e.target.value, 10) || 1)
              }
              className="min-h-[44px] w-32 max-w-full"
              aria-describedby="machineCavitiesHelp"
            />
            <p
              id="machineCavitiesHelp"
              className="max-w-56 text-xs text-muted-foreground"
            >
              {t("plainMachineCavitiesHelp")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="machineCycleTime">
              {t("machineFormCycleTimeLabel")}
            </Label>
            <NumberInput
              id="machineCycleTime"
              decimal
              min={0.1}
              value={secondsPerShot}
              onChange={(e) =>
                setSecondsPerShot(parseFloat(e.target.value) || 1.0)
              }
              className="min-h-[44px] w-32 max-w-full"
              aria-describedby="machineCycleTimeHelp"
            />
            <p
              id="machineCycleTimeHelp"
              className="max-w-56 text-xs text-muted-foreground"
            >
              {t("plainMachineCycleTimeHelp")}
            </p>
          </div>
          <Button type="submit" className="min-h-[44px] px-6 py-3 text-base">
            <Plus data-icon="inline-start" className="size-5" aria-hidden />
            {t("machineFormSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
