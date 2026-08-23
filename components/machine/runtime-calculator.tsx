"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Target, TrendingUp } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { ItemCombo } from "@/lib/services/itemComboService";
import type { Machine } from "@/lib/services/machineService";
import { TargetPanel } from "./target-panel";
import { TopUpPanel } from "./top-up-panel";

export interface RuntimeCalculatorProps {
  machines: Machine[];
  combos: ItemCombo[];
  itemsById: Record<string, { stock?: number }>;
  itemNameById: Record<string, string>;
}

/**
 * The tool, as opposed to the two record editors: pick a set, then ask one of
 * two questions about it. It reads stock and never writes anything.
 */
export function RuntimeCalculator({
  machines,
  combos,
  itemsById,
  itemNameById,
}: RuntimeCalculatorProps) {
  const { t } = useLanguage();
  const [comboId, setComboId] = React.useState("");
  const [machineId, setMachineId] = React.useState("");
  const [targetQty, setTargetQty] = React.useState(0);
  const [machineByItemId, setMachineByItemId] = React.useState<
    Record<string, string>
  >({});

  const combo = combos.find((c) => c.id === comboId) ?? null;

  const setMachineForItem = React.useCallback(
    (itemId: string, nextMachineId: string) =>
      setMachineByItemId((prev) => ({ ...prev, [itemId]: nextMachineId })),
    [],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-surface-2 pb-6">
        <CardTitle className="flex items-center gap-2 font-heading text-xl font-semibold">
          <Calculator className="size-5 text-primary" aria-hidden />
          {t("runtimeCalcTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("runtimeCalcSubtitle")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <Label htmlFor="calcCombo">{t("runtimeCalcComboLabel")}</Label>
          <Select value={comboId} onValueChange={setComboId}>
            <SelectTrigger
              id="calcCombo"
              className="min-h-[44px] w-56 max-w-full"
            >
              <SelectValue placeholder={t("selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {combos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!combo ? (
          <p className="text-sm text-muted-foreground">
            {t("runtimeCalcSelectComboHint")}
          </p>
        ) : (
          <Tabs defaultValue="topup" className="w-full min-w-0 gap-6">
            <div className="-mx-1 w-full min-w-0 overflow-x-auto px-1 pb-1">
              <TabsList className="h-auto w-max gap-1 rounded-xl bg-surface-3 p-1.5">
                <TabsTrigger
                  value="topup"
                  className="h-11 gap-2 rounded-lg px-4 text-base data-[state=active]:bg-card"
                >
                  <TrendingUp className="size-5 shrink-0" aria-hidden />
                  {t("runtimeCalcModeTopUp")}
                </TabsTrigger>
                <TabsTrigger
                  value="target"
                  className="h-11 gap-2 rounded-lg px-4 text-base data-[state=active]:bg-card"
                >
                  <Target className="size-5 shrink-0" aria-hidden />
                  {t("runtimeCalcModeTarget")}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="topup" className="min-w-0">
              <TopUpPanel
                combo={combo}
                machines={machines}
                machineId={machineId}
                onMachineIdChange={setMachineId}
                itemsById={itemsById}
                itemNameById={itemNameById}
              />
            </TabsContent>

            <TabsContent value="target" className="min-w-0">
              <TargetPanel
                combo={combo}
                machines={machines}
                itemsById={itemsById}
                itemNameById={itemNameById}
                targetQty={targetQty}
                onTargetQtyChange={setTargetQty}
                machineByItemId={machineByItemId}
                onMachineForItem={setMachineForItem}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
