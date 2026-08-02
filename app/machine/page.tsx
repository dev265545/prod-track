"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cog, Boxes, Calculator, Trash2, Plus } from "lucide-react";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import {
  getMachines,
  saveMachine,
  deleteMachine,
  type Machine,
} from "@/lib/services/machineService";
import {
  getItemCombos,
  saveItemCombo,
  deleteItemCombo,
  calculateTopUpPlan,
  calculateComponentNeedsForTarget,
  calculateMachineRuntimeSeconds,
  findBottleneckItemId,
  type ItemCombo,
  type ItemComboComponent,
} from "@/lib/services/itemComboService";
import { getItems } from "@/lib/services/itemService";
import { toast } from "sonner";
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
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useLanguage } from "@/components/language-provider";

export default function MachinePage() {
  const { t } = useLanguage();
  const { ready: guardReady } = useAuthGuard();
  const [dataLoaded, setDataLoaded] = useState(false);
  const ready = guardReady && dataLoaded;

  const [machines, setMachines] = useState<Machine[]>([]);
  const [combos, setCombos] = useState<ItemCombo[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);

  const [machineName, setMachineName] = useState("");
  const [machineCavities, setMachineCavities] = useState(1);
  const [machineCycleTime, setMachineCycleTime] = useState(1.0);

  const [comboName, setComboName] = useState("");
  const [comboComponents, setComboComponents] = useState<
    ItemComboComponent[]
  >([{ itemId: "", ratio: 1 }]);

  const [calcMode, setCalcMode] = useState<"topup" | "target">("topup");
  const [calcComboId, setCalcComboId] = useState("");
  const [calcMachineId, setCalcMachineId] = useState("");
  const [targetQty, setTargetQty] = useState(0);
  const [targetMachineByItem, setTargetMachineByItem] = useState<
    Record<string, string>
  >({});

  const load = async () => {
    const [machineList, comboList, itemList] = await Promise.all([
      getMachines(),
      getItemCombos(),
      getItems(),
    ]);
    setMachines(machineList);
    setCombos(comboList);
    setItems(itemList);
  };

  useEffect(() => {
    if (!guardReady) return;
    load().then(() => setDataLoaded(true));
  }, [guardReady]);

  const itemsById = useMemo(
    () =>
      Object.fromEntries(
        items.map((i) => [i.id as string, i as { stock?: number }]),
      ) as Record<string, { stock?: number }>,
    [items],
  );
  const itemNameById = useMemo(
    () =>
      Object.fromEntries(
        items.map((i) => [i.id as string, i.name as string]),
      ) as Record<string, string>,
    [items],
  );

  const calcMachine = machines.find((m) => m.id === calcMachineId) ?? null;
  const calcCombo = combos.find((c) => c.id === calcComboId) ?? null;

  const autoProducedItemId = useMemo(
    () => (calcCombo ? findBottleneckItemId(calcCombo, itemsById) : ""),
    [calcCombo, itemsById],
  );
  const topUpResult = useTopUpCalc(
    calcMachine,
    calcCombo,
    autoProducedItemId,
    itemsById,
  );
  const targetNeeds = useMemo(
    () =>
      calcCombo
        ? calculateComponentNeedsForTarget(calcCombo, itemsById, targetQty)
        : [],
    [calcCombo, itemsById, targetQty],
  );
  const targetRows = useMemo(
    () =>
      targetNeeds.map((need) => {
        const machineId = targetMachineByItem[need.itemId] ?? "";
        const machine = machines.find((m) => m.id === machineId) ?? null;
        const runtimeSeconds = machine
          ? calculateMachineRuntimeSeconds(
              Math.ceil(need.neededAdditionalPieces),
              machine.cavities,
              machine.cycleTimeSeconds,
            )
          : null;
        return { need, machineId, machine, runtimeSeconds };
      }),
    [targetNeeds, targetMachineByItem, machines],
  );
  const targetTotal = useMemo(() => {
    const perMachineSeconds = new Map<string, number>();
    let missingAssignment = false;
    for (const row of targetRows) {
      if (row.runtimeSeconds === null) {
        if (row.need.neededAdditionalPieces > 0) missingAssignment = true;
        continue;
      }
      perMachineSeconds.set(
        row.machineId,
        (perMachineSeconds.get(row.machineId) ?? 0) + row.runtimeSeconds,
      );
    }
    const totalSeconds =
      perMachineSeconds.size > 0 ? Math.max(...perMachineSeconds.values()) : 0;
    return {
      totalSeconds,
      missingAssignment,
      hasAssignments: perMachineSeconds.size > 0,
    };
  }, [targetRows]);

  if (!ready) {
    return (
      <AppLoadingScreen
        title={t("loadingOpeningMachine")}
        description={t("loadingOpeningMachineDesc")}
      />
    );
  }

  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";

  function updateComponent(
    index: number,
    patch: Partial<ItemComboComponent>,
  ) {
    setComboComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  return (
    <AppShell>
      <main className="flex flex-col gap-10 animate-fade-in">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("machinePageTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("machinePageIntro")}
          </p>
        </header>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Cog className="size-5 text-primary" />
              {t("machineCardTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("machineCardSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
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
                        className="transition-colors hover:bg-muted/40"
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
                                aria-label={t("machineDeleteAria", {
                                  name: m.name,
                                })}
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("machineDeleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("machineDeleteDesc", { name: m.name })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={async () => {
                                    try {
                                      await deleteMachine(m.id);
                                      await load();
                                      toast.success(t("machineDeleteSuccess"));
                                    } catch {
                                      toast.error(t("machineDeleteFail"));
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <form
              className="flex flex-wrap gap-4 items-end rounded-xl border border-border/60 bg-muted/15 p-4 sm:p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!machineName.trim()) return;
                try {
                  await saveMachine({
                    name: machineName.trim(),
                    cavities: machineCavities,
                    cycleTimeSeconds: machineCycleTime,
                  });
                  setMachineName("");
                  setMachineCavities(1);
                  setMachineCycleTime(1.0);
                  await load();
                  toast.success(t("machineAddSuccess"));
                } catch {
                  toast.error(t("machineAddFail"));
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="machineName">{t("machineFormNameLabel")}</Label>
                <Input
                  id="machineName"
                  type="text"
                  value={machineName}
                  onChange={(e) => setMachineName(e.target.value)}
                  placeholder={t("machineFormNamePlaceholder")}
                  className="w-48 min-h-[44px]"
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
                  value={machineCavities}
                  onChange={(e) =>
                    setMachineCavities(parseInt(e.target.value, 10) || 1)
                  }
                  className="w-32 min-h-[44px]"
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
                  value={machineCycleTime}
                  onChange={(e) =>
                    setMachineCycleTime(parseFloat(e.target.value) || 1.0)
                  }
                  className="w-32 min-h-[44px]"
                  aria-describedby="machineCycleTimeHelp"
                />
                <p
                  id="machineCycleTimeHelp"
                  className="max-w-56 text-xs text-muted-foreground"
                >
                  {t("plainMachineCycleTimeHelp")}
                </p>
              </div>
              <Button type="submit" className={btnPrimaryClass}>
                {t("machineFormSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Boxes className="size-5 text-primary" />
              {t("comboCardTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("comboCardSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
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
                      <TableCell colSpan={3} className="h-24 text-center">
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Skeleton className="h-4 w-40 rounded-md" />
                          <span className="text-sm text-muted-foreground">
                            {t("comboEmptyHint")}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    combos.map((c) => (
                      <TableRow
                        key={c.id}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.components
                            .map(
                              (comp) =>
                                `${itemNameById[comp.itemId] ?? comp.itemId} × ${comp.ratio}`,
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
                                title={t("comboDeleteTitle")}
                                aria-label={t("comboDeleteAria", {
                                  name: c.name,
                                })}
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("comboDeleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("comboDeleteDesc", { name: c.name })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={async () => {
                                    try {
                                      await deleteItemCombo(c.id);
                                      await load();
                                      toast.success(t("comboDeleteSuccess"));
                                    } catch {
                                      toast.error(t("comboDeleteFail"));
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <form
              className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/15 p-4 sm:p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!comboName.trim()) return;
                const validComponents = comboComponents.filter(
                  (c) => c.itemId,
                );
                if (validComponents.length === 0) return;
                try {
                  await saveItemCombo({
                    name: comboName.trim(),
                    components: validComponents,
                  });
                  setComboName("");
                  setComboComponents([{ itemId: "", ratio: 1 }]);
                  await load();
                  toast.success(t("comboAddSuccess"));
                } catch {
                  toast.error(t("comboAddFail"));
                }
              }}
            >
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="comboName">{t("comboFormNameLabel")}</Label>
                  <Input
                    id="comboName"
                    type="text"
                    value={comboName}
                    onChange={(e) => setComboName(e.target.value)}
                    placeholder={t("comboFormNamePlaceholder")}
                    className="w-56 min-h-[44px]"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Label>{t("comboFormComponentsLabel")}</Label>
                {comboComponents.map((comp, index) => (
                  <div key={index} className="flex flex-wrap gap-3 items-end">
                    <Select
                      value={comp.itemId}
                      onValueChange={(v) =>
                        updateComponent(index, { itemId: v })
                      }
                    >
                      <SelectTrigger className="w-56 min-h-[44px]">
                        <SelectValue placeholder={t("selectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((i) => (
                          <SelectItem
                            key={i.id as string}
                            value={i.id as string}
                          >
                            {i.name as string}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <NumberInput
                      decimal
                      min={0.01}
                      value={comp.ratio}
                      onChange={(e) =>
                        updateComponent(index, {
                          ratio: parseFloat(e.target.value) || 1,
                        })
                      }
                      className="w-28 min-h-[44px]"
                      placeholder={t("comboFormRatioLabel")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={comboComponents.length <= 1}
                      onClick={() =>
                        setComboComponents((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() =>
                    setComboComponents((prev) => [
                      ...prev,
                      { itemId: "", ratio: 1 },
                    ])
                  }
                >
                  <Plus data-icon="inline-start" className="size-4" />
                  {t("comboFormAddComponent")}
                </Button>
              </div>
              <Button type="submit" className={btnPrimaryClass + " w-fit"}>
                {t("comboFormSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Calculator className="size-5 text-primary" />
              {t("runtimeCalcTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("runtimeCalcSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-wrap gap-4 items-end mb-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="calcCombo">{t("runtimeCalcComboLabel")}</Label>
                <Select value={calcComboId} onValueChange={setCalcComboId}>
                  <SelectTrigger id="calcCombo" className="w-56 min-h-[44px]">
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
              <Tabs
                value={calcMode}
                onValueChange={(v) => setCalcMode(v as "topup" | "target")}
              >
                <TabsList>
                  <TabsTrigger value="topup">{t("runtimeCalcModeTopUp")}</TabsTrigger>
                  <TabsTrigger value="target">{t("runtimeCalcModeTarget")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {!calcCombo ? (
              <p className="text-sm text-muted-foreground">
                {t("runtimeCalcSelectComboHint")}
              </p>
            ) : calcMode === "topup" ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-2 max-w-xs">
                    <Label htmlFor="calcMachine">{t("runtimeCalcMachineLabel")}</Label>
                    <Select value={calcMachineId} onValueChange={setCalcMachineId}>
                      <SelectTrigger id="calcMachine" className="w-56 min-h-[44px]">
                        <SelectValue placeholder={t("selectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {machines.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!calcMachine ? (
                  <p className="text-sm text-muted-foreground">
                    {t("runtimeCalcSelectHint")}
                  </p>
                ) : !topUpResult || !topUpResult.inCombo ? (
                  <p className="text-sm text-muted-foreground">
                    {t("runtimeCalcNotInCombo")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("runtimeCalcProducedItemLabel")}
                      </p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {itemNameById[autoProducedItemId] ?? autoProducedItemId}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("runtimeCalcBottleneckUnits")}:{" "}
                        {Math.floor(topUpResult.producedUnitsPossible)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("runtimeCalcBottleneckItem")}
                      </p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {itemNameById[topUpResult.bottleneckItemId] ??
                          topUpResult.bottleneckItemId}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("runtimeCalcBottleneckUnits")}:{" "}
                        {Math.floor(topUpResult.bottleneckUnits)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("runtimeCalcNeededPieces")}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {Math.ceil(topUpResult.neededPieces)}
                      </p>
                    </div>
                    <div className="rounded-xl border-2 border-primary/25 bg-primary/10 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("runtimeCalcRuntime")}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {formatDuration(topUpResult.runtimeSeconds)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {topUpResult.neededPieces <= 0
                          ? t("runtimeCalcAlreadyEnough")
                          : `${t("runtimeCalcResultingUnits")}: ${Math.floor(topUpResult.resultingComboUnits)}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2 max-w-xs">
                  <Label htmlFor="calcTargetQty">
                    {t("runtimeCalcTargetQtyLabel")}
                  </Label>
                  <NumberInput
                    id="calcTargetQty"
                    min={0}
                    value={targetQty}
                    onChange={(e) =>
                      setTargetQty(parseFloat(e.target.value) || 0)
                    }
                    className="w-40 min-h-[44px]"
                  />
                </div>
                {targetQty <= 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("runtimeCalcTargetEnterQty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
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
                        {targetRows.map(({ need, machineId, runtimeSeconds }) => (
                          <TableRow key={need.itemId}>
                            <TableCell className="font-medium">
                              {itemNameById[need.itemId] ?? need.itemId}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {need.ratio}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {need.currentStock}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">
                              {Math.ceil(need.neededAdditionalPieces)}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={machineId || "_none"}
                                onValueChange={(v) =>
                                  setTargetMachineByItem((prev) => ({
                                    ...prev,
                                    [need.itemId]: v === "_none" ? "" : v,
                                  }))
                                }
                              >
                                <SelectTrigger className="w-44 min-h-[40px]">
                                  <SelectValue
                                    placeholder={t("runtimeCalcTargetSelectMachine")}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">
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
                              {runtimeSeconds === null
                                ? "—"
                                : formatDuration(runtimeSeconds)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-4 rounded-xl border-2 border-primary/25 bg-primary/10 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("runtimeCalcTargetTotalLabel")}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {targetTotal.hasAssignments
                          ? formatDuration(targetTotal.totalSeconds)
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {targetTotal.missingAssignment
                          ? t("runtimeCalcTargetMissingAssignment")
                          : t("runtimeCalcTargetTotalHint")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

function useTopUpCalc(
  machine: Machine | null,
  combo: ItemCombo | null,
  producedItemId: string,
  itemsById: Record<string, { stock?: number }>,
) {
  return useMemo(() => {
    if (!machine || !combo || !producedItemId) return null;
    return calculateTopUpPlan(combo, itemsById, producedItemId, {
      cavities: machine.cavities,
      cycleTimeSeconds: machine.cycleTimeSeconds,
    });
  }, [machine, combo, producedItemId, itemsById]);
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${rounded}s`;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}m ${secs}s`;
}
