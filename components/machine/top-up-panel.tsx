"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatTile } from "@/components/inventory/stat-tile";
import { Boxes, Hammer, Timer, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { ItemCombo } from "@/lib/services/itemComboService";
import { isMachineUsable, type Machine } from "@/lib/services/machineService";
import {
  formatRunDuration,
  resolveTopUpView,
} from "@/lib/utils/machineRuntime";
import {
  MachineProblemNotice,
  machineProblemMessageKey,
} from "./machine-problem";

/**
 * An answer whose value is an item *name*, not a figure.
 *
 * `StatTile` is deliberately built for numbers — its value line is a large
 * nowrap face — so a long item name would be clipped by the card. Item names
 * get the same card shell and the same icon chip, but a wrapping face.
 */
function ItemAnswerCard({
  label,
  itemName,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  itemName: string;
  caption: string;
  icon: LucideIcon;
  tone: "neutral" | "amber";
}) {
  const rule = tone === "amber" ? "bg-warning" : "bg-surface-4";
  const chip =
    tone === "amber"
      ? "bg-surface-3 text-warning"
      : "bg-surface-3 text-foreground";
  return (
    <Card className="relative overflow-hidden bg-card">
      <span className={`absolute inset-y-0 left-0 w-1 ${rule}`} aria-hidden />
      <CardContent className="flex items-center gap-4 p-5 sm:p-6">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${chip}`}
        >
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="font-heading text-xl font-bold leading-tight text-foreground">
            {itemName}
          </span>
          <span className="text-xs leading-snug text-muted-foreground">
            {caption}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export interface TopUpPanelProps {
  combo: ItemCombo;
  machines: Machine[];
  machineId: string;
  onMachineIdChange: (id: string) => void;
  itemsById: Record<string, { stock?: number }>;
  itemNameById: Record<string, string>;
}

/**
 * "Run this machine until stock is level again": pick the machine, and the
 * tool works out which item is shortest and how long to run for.
 */
export function TopUpPanel({
  combo,
  machines,
  machineId,
  onMachineIdChange,
  itemsById,
  itemNameById,
}: TopUpPanelProps) {
  const { t } = useLanguage();
  const machine = machines.find((m) => m.id === machineId) ?? null;
  const view = React.useMemo(
    () => resolveTopUpView(combo, machine, itemsById),
    [combo, machine, itemsById],
  );
  const nameOf = (id: string) => itemNameById[id] ?? id;
  // The machine's own record is broken, so there is no honest duration to
  // show. Say so instead of printing a figure the operator would act on.
  const problemKey = machineProblemMessageKey(view?.machineProblems ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="calcMachine">{t("runtimeCalcMachineLabel")}</Label>
        <Select value={machineId} onValueChange={onMachineIdChange}>
          <SelectTrigger
            id="calcMachine"
            className="min-h-[44px] w-56 max-w-full"
          >
            <SelectValue placeholder={t("selectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {machines.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {isMachineUsable(m)
                  ? m.name
                  : `${m.name} — ${t("machChkNeedsFixing")}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!machine ? (
        <p className="text-sm text-muted-foreground">
          {t("runtimeCalcSelectHint")}
        </p>
      ) : problemKey ? (
        <MachineProblemNotice
          headline={`${machine.name} — ${t("machChkCannotRun")}`}
          problem={t(problemKey)}
          hint={t("machChkFixHint")}
        />
      ) : !view || !view.inCombo ? (
        <p className="text-sm text-muted-foreground">
          {t("runtimeCalcNotInCombo")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ItemAnswerCard
            label={t("runtimeCalcProducedItemLabel")}
            itemName={nameOf(view.producedItemId)}
            caption={`${t("runtimeCalcBottleneckUnits")}: ${view.producedItemSets}`}
            icon={Hammer}
            tone="neutral"
          />
          <ItemAnswerCard
            label={t("runtimeCalcBottleneckItem")}
            itemName={nameOf(view.shortestItemId)}
            caption={`${t("runtimeCalcBottleneckUnits")}: ${view.shortestItemSets}`}
            icon={TriangleAlert}
            tone="amber"
          />
          <StatTile
            label={t("runtimeCalcNeededPieces")}
            value={view.neededPieces}
            icon={Boxes}
          />
          <StatTile
            label={t("runtimeCalcRuntime")}
            // Non-null here: an unusable machine took the notice branch above.
            value={formatRunDuration(view.runtimeSeconds ?? 0)}
            caption={
              view.alreadyEnough
                ? t("runtimeCalcAlreadyEnough")
                : `${t("runtimeCalcResultingUnits")}: ${view.setsAfterRun}`
            }
            icon={Timer}
            tone="emerald"
          />
        </div>
      )}
    </div>
  );
}
