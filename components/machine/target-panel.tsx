"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
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
import { StatTile } from "@/components/inventory/stat-tile";
import { Timer } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { ItemCombo } from "@/lib/services/itemComboService";
import type { Machine } from "@/lib/services/machineService";
import { buildTargetPlan, formatRunDuration } from "@/lib/utils/machineRuntime";

const NO_MACHINE = "_none";

export interface TargetPanelProps {
  combo: ItemCombo;
  machines: Machine[];
  itemsById: Record<string, { stock?: number }>;
  itemNameById: Record<string, string>;
  targetQty: number;
  onTargetQtyChange: (qty: number) => void;
  machineByItemId: Record<string, string>;
  onMachineForItem: (itemId: string, machineId: string) => void;
}

/**
 * "I need this many finished sets": how many pieces of each item are still
 * missing, which machine makes each, and how long the whole thing takes.
 */
export function TargetPanel({
  combo,
  machines,
  itemsById,
  itemNameById,
  targetQty,
  onTargetQtyChange,
  machineByItemId,
  onMachineForItem,
}: TargetPanelProps) {
  const { t } = useLanguage();
  const plan = React.useMemo(
    () => buildTargetPlan(combo, itemsById, machines, targetQty, machineByItemId),
    [combo, itemsById, machines, targetQty, machineByItemId],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor="calcTargetQty">{t("runtimeCalcTargetQtyLabel")}</Label>
        <NumberInput
          id="calcTargetQty"
          min={0}
          value={targetQty}
          onChange={(e) => onTargetQtyChange(parseFloat(e.target.value) || 0)}
          className="min-h-[44px] w-40 max-w-full"
        />
      </div>

      {targetQty <= 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("runtimeCalcTargetEnterQty")}
        </p>
      ) : (
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="w-full min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("runtimeCalcTargetTableItem")}</TableHead>
                  <TableHead className="text-right tabular-nums">
                    {t("runtimeCalcTargetTableRatio")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums">
                    {t("runtimeCalcTargetTableStock")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums">
                    {t("runtimeCalcTargetTableNeeded")}
                  </TableHead>
                  <TableHead>{t("runtimeCalcTargetTableMachine")}</TableHead>
                  <TableHead className="text-right tabular-nums">
                    {t("runtimeCalcTargetTableRuntime")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.rows.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell className="font-medium">
                      {itemNameById[row.itemId] ?? row.itemId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.ratio}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currentStock}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {row.neededPieces}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.machineId || NO_MACHINE}
                        onValueChange={(v) =>
                          onMachineForItem(
                            row.itemId,
                            v === NO_MACHINE ? "" : v,
                          )
                        }
                      >
                        <SelectTrigger
                          className="min-h-[44px] w-44"
                          aria-label={t("runtimeCalcTargetSelectMachine")}
                        >
                          <SelectValue
                            placeholder={t("runtimeCalcTargetSelectMachine")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MACHINE}>
                            {t("runtimeCalcTargetSelectMachine")}
                          </SelectItem>
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.runtimeSeconds === null
                        ? "—"
                        : formatRunDuration(row.runtimeSeconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <StatTile
            label={t("runtimeCalcTargetTotalLabel")}
            value={
              plan.hasAssignments ? formatRunDuration(plan.totalSeconds) : "—"
            }
            caption={
              plan.missingAssignment
                ? t("runtimeCalcTargetMissingAssignment")
                : t("runtimeCalcTargetTotalHint")
            }
            icon={Timer}
            tone={plan.missingAssignment ? "amber" : "emerald"}
          />
        </div>
      )}
    </div>
  );
}
