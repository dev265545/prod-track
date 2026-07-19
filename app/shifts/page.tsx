"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { CalendarDays, Clock, Trash2 } from "lucide-react";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { getShifts, saveShift, deleteShift } from "@/lib/services/shiftService";
import {
  deleteSundayCategory,
  getSundayCategories,
  saveSundayCategory,
  type SundayCategory,
} from "@/lib/services/sundayCategoryService";
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

export default function ShiftsPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const [dataLoaded, setDataLoaded] = useState(false);
  const ready = guardReady && dataLoaded;
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [shiftName, setShiftName] = useState("");
  const [shiftHours, setShiftHours] = useState(8);

  const [sundayCategories, setSundayCategories] = useState<SundayCategory[]>(
    [],
  );
  const [categoryName, setCategoryName] = useState("");
  const [categoryMode, setCategoryMode] = useState<"threshold" | "step">(
    "threshold",
  );
  const [requiredPresent, setRequiredPresent] = useState(12);
  const [earnedSundays, setEarnedSundays] = useState(2);
  const [everyPresentDays, setEveryPresentDays] = useState(6);
  const [earnedPerStep, setEarnedPerStep] = useState(1);

  const load = async () => {
    const [shiftList, sundayCategoryList] = await Promise.all([
      getShifts(),
      getSundayCategories(),
    ]);
    setShifts(shiftList);
    setSundayCategories(sundayCategoryList);
  };

  useEffect(() => {
    if (!guardReady) return;
    load().then(() => setDataLoaded(true));
  }, [guardReady]);

  if (!ready) {
    return (
      <AppLoadingScreen
        title={t("loadingOpeningShifts")}
        description={t("loadingOpeningShiftsDesc")}
      />
    );
  }

  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";

  return (
    <AppShell>
      <main className="flex flex-col gap-10 animate-fade-in">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("shiftsPageTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("shiftsPageIntro")}
          </p>
        </header>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Clock className="size-5 text-primary" />
              {t("shiftsCardShiftsTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("shiftsCardShiftsSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("shiftsColName")}</TableHead>
                    <TableHead className="text-right tabular-nums">
                      {t("shiftsColHoursPerDay")}
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center">
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Skeleton className="h-4 w-40 rounded-md" />
                          <span className="text-sm text-muted-foreground">
                            {t("shiftsEmptyHint")}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    shifts.map((s) => (
                      <TableRow
                        key={s.id as string}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="font-medium">
                          {s.name as string}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.hoursPerDay as number}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                title={t("shiftsDeleteTitle")}
                                aria-label={t("shiftsDeleteShiftAria")}
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("shiftsDeleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("shiftsDeleteDesc", { name: String(s.name) })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await deleteShift(s.id as string);
                                      await load();
                                      toast.success(t("shiftsDeleteSuccess"));
                                    } catch {
                                      toast.error(t("shiftsDeleteFail"));
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
                if (!shiftName.trim()) return;
                try {
                  await saveShift({
                    name: shiftName.trim(),
                    hoursPerDay: shiftHours,
                  });
                  setShiftName("");
                  setShiftHours(8);
                  await load();
                  toast.success(t("shiftsAddSuccess"));
                } catch {
                  toast.error(t("shiftsAddFail"));
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="shiftName">{t("shiftsFormNameLabel")}</Label>
                <Input
                  id="shiftName"
                  type="text"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder={t("shiftsFormNamePlaceholder")}
                  className="w-48 min-h-[44px]"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="shiftHours">{t("shiftsFormHoursLabel")}</Label>
                <Input
                  id="shiftHours"
                  type="number"
                  min={1}
                  max={24}
                  value={shiftHours}
                  onChange={(e) =>
                    setShiftHours(
                      Math.max(
                        1,
                        Math.min(24, parseInt(e.target.value, 10) || 8),
                      ),
                    )
                  }
                  className="w-24 min-h-[44px]"
                />
              </div>
              <Button type="submit" className={btnPrimaryClass}>
                {t("shiftsFormSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <CalendarDays className="size-5 text-primary" />
              {t("shiftsSundayCardTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("shiftsSundayCardSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("shiftsSundayColName")}</TableHead>
                    <TableHead>{t("shiftsSundayColRule")}</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sundayCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center">
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Skeleton className="h-4 w-48 rounded-md" />
                          <span className="text-sm text-muted-foreground">
                            {t("shiftsSundayEmptyHint")}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sundayCategories.map((c) => (
                      <TableRow
                        key={c.id as string}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="font-medium">
                          {c.name as string}
                        </TableCell>
                        <TableCell>
                          {(c.mode as string) === "step"
                            ? t("shiftsSundayRuleStep", {
                                every: c.everyPresentDays as number,
                                earned: c.earnedPerStep as number,
                              })
                            : t("shiftsSundayRuleThreshold", {
                                required: c.requiredPresent as number,
                                earned: c.earnedSundays as number,
                              })}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                title={t("shiftsSundayDeleteTitle")}
                                aria-label={t("shiftsSundayDeleteCatAria")}
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("shiftsSundayDeleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("shiftsSundayDeleteDesc", {
                                    name: String(c.name),
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await deleteSundayCategory(c.id as string);
                                      await load();
                                      toast.success(t("shiftsSundayDeleteSuccess"));
                                    } catch {
                                      toast.error(t("shiftsSundayDeleteFail"));
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
                if (!categoryName.trim()) return;
                try {
                  if (categoryMode === "threshold") {
                    await saveSundayCategory({
                      name: categoryName.trim(),
                      mode: "threshold",
                      requiredPresent: Math.max(1, requiredPresent),
                      earnedSundays: Math.max(1, earnedSundays),
                    });
                  } else {
                    await saveSundayCategory({
                      name: categoryName.trim(),
                      mode: "step",
                      everyPresentDays: Math.max(1, everyPresentDays),
                      earnedPerStep: Math.max(1, earnedPerStep),
                    });
                  }
                  setCategoryName("");
                  setCategoryMode("threshold");
                  setRequiredPresent(12);
                  setEarnedSundays(2);
                  setEveryPresentDays(6);
                  setEarnedPerStep(1);
                  await load();
                  toast.success(t("shiftsSundayAddSuccess"));
                } catch {
                  toast.error(t("shiftsSundayAddFail"));
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="catName">{t("shiftsSundayFormNameLabel")}</Label>
                <Input
                  id="catName"
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder={t("shiftsSundayFormNamePlaceholder")}
                  className="w-64 min-h-[44px]"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catMode">{t("shiftsSundayFormModeLabel")}</Label>
                <Select
                  value={categoryMode}
                  onValueChange={(v) =>
                    setCategoryMode(v as "threshold" | "step")
                  }
                >
                  <SelectTrigger id="catMode" className="w-48 min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="threshold">{t("shiftsSundayModeThreshold")}</SelectItem>
                    <SelectItem value="step">{t("shiftsSundayModeStep")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {categoryMode === "threshold" ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="requiredPresent">{t("shiftsSundayPresentNeeded")}</Label>
                    <Input
                      id="requiredPresent"
                      type="number"
                      min={1}
                      value={requiredPresent}
                      onChange={(e) =>
                        setRequiredPresent(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-40 min-h-[44px]"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="earnedSundays">{t("shiftsSundayEarnedLabel")}</Label>
                    <Input
                      id="earnedSundays"
                      type="number"
                      min={1}
                      value={earnedSundays}
                      onChange={(e) =>
                        setEarnedSundays(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-32 min-h-[44px]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="everyPresentDays">{t("shiftsSundayEveryPresent")}</Label>
                    <Input
                      id="everyPresentDays"
                      type="number"
                      min={1}
                      value={everyPresentDays}
                      onChange={(e) =>
                        setEveryPresentDays(
                          Math.max(1, parseInt(e.target.value, 10) || 1),
                        )
                      }
                      className="w-40 min-h-[44px]"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="earnedPerStep">{t("shiftsSundayPerStep")}</Label>
                    <Input
                      id="earnedPerStep"
                      type="number"
                      min={1}
                      value={earnedPerStep}
                      onChange={(e) =>
                        setEarnedPerStep(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-32 min-h-[44px]"
                    />
                  </div>
                </>
              )}

              <Button type="submit" className={btnPrimaryClass}>
                {t("shiftsSundayFormSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
