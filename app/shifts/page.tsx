"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LoadError } from "@/components/load-error";
import { SettingsSection } from "@/components/settings/shared";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { readNumericInput } from "@/lib/utils/numericInput";
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
import { CalendarDays, Clock, Info, Pencil, Plus, Save, Timer, Trash2, X } from "lucide-react";
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
import {
  SundayRuleEditor,
  describeSundayRule,
} from "@/components/rules/sunday-rule-editor";
import {
  DEFAULT_SUNDAY_RULE,
  normalizeSundayRule,
  type SundayRule,
} from "@/lib/utils/sundayRule";
import { resolveSundayCategoryRule } from "@/lib/services/sundayCategoryService";
import { DayPayCapEditor } from "@/components/rules/day-pay-cap-editor";
import {
  getAppSettings,
  saveAppSettings,
} from "@/lib/services/appSettingsService";
import { normalizeDayPayCap, type DayPayCap } from "@/lib/utils/date";

type PayRules = {
  shifts: Record<string, unknown>[];
  sundayCategories: SundayCategory[];
  /** Most one date may pay, in days. `null` = no limit. */
  maxDayPayFraction: DayPayCap;
};

/** Module scope so the effect can hand the setter straight to the promise
 * rather than calling setState inside its own body. */
async function fetchPayRules(): Promise<PayRules> {
  const [shifts, sundayCategories, settings] = await Promise.all([
    getShifts(),
    getSundayCategories(),
    getAppSettings(),
  ]);
  return {
    shifts,
    sundayCategories,
    maxDayPayFraction: normalizeDayPayCap(settings.maxDayPayFraction),
  };
}

export default function ShiftsPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const [data, setData] = useState<PayRules | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const ready = guardReady && data !== null;
  const shifts = data?.shifts ?? [];
  const sundayCategories = data?.sundayCategories ?? [];
  const [shiftName, setShiftName] = useState("");
  // Held as text so an emptied box stays empty while it is being retyped; the
  // old on-keystroke `parseInt(...) || 8` snapped the field back to 8 the
  // instant it was cleared. Bounds are applied once, on submit.
  const [shiftHours, setShiftHours] = useState("8");

  const [categoryName, setCategoryName] = useState("");
  // `null` means "adding a new category"; an id means the form is editing that
  // one. Rules are rich enough now that add-only would strand every mistake.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryRule, setCategoryRule] = useState<SundayRule>(DEFAULT_SUNDAY_RULE);
  // Held separately from `data` so typing in the limit box does not need a
  // database round trip per keystroke; `null` means the form has not been
  // seeded from storage yet.
  const [dayPayCapDraft, setDayPayCapDraft] = useState<
    { value: DayPayCap } | null
  >(null);
  const [savingDayPayCap, setSavingDayPayCap] = useState(false);

  const resetCategoryForm = () => {
    setCategoryName("");
    setEditingId(null);
    setCategoryRule(DEFAULT_SUNDAY_RULE);
  };

  const load = useCallback(async () => {
    setData(await fetchPayRules());
  }, []);

  /**
   * The old `.catch(() => {})` left `data` null, and `ready` is derived from
   * it — so a failed read parked the screen on the loading splash for good.
   */
  const retry = useCallback(() => {
    setLoadFailed(false);
    setData(null);
    fetchPayRules()
      .then((next) => {
        setData(next);
        setDayPayCapDraft({ value: next.maxDayPayFraction });
      })
      .catch((err) => {
        console.error("pay rules: load failed", err);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    if (!guardReady) return;
    retry();
  }, [guardReady, retry]);

  if (loadFailed) {
    return (
      <AppShell>
        <main className="flex w-full min-w-0 flex-col gap-6">
          <LoadError onRetry={retry} />
        </main>
      </AppShell>
    );
  }

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
      <main className="animate-fade-in flex w-full min-w-0 flex-col gap-6">
        {/* No `action`: this screen is three independent settings blocks,
            each with its own save. Promoting any one of them would be
            arbitrary. */}
        <PageHeader title={t("shiftsPageTitle")} intro={t("setgShiftsIntro")} />

        {/* The three blocks below are not unrelated settings: together they
            are the whole answer to "how does a day of work turn into pay?" —
            how long a day is, what extra days it earns, and the most any one
            day may pay. */}
        <div className="flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Info className="size-5 shrink-0" aria-hidden />
            {t("setgShiftsWhyTitle")}
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t("setgShiftsWhyBody")}
          </p>
        </div>

        <SettingsSection
          icon={Clock}
          title={`${t("setgShiftsStep", { n: 1 })} · ${t("shiftsCardShiftsTitle")}`}
          description={t("shiftsCardShiftsSubtitle")}
        >
          <div className="w-full overflow-x-auto rounded-xl border border-border">
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
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-base text-muted-foreground"
                    >
                      {t("shiftsEmptyHint")}
                    </TableCell>
                  </TableRow>
                ) : (
                  shifts.map((s) => (
                    <TableRow
                      key={s.id as string}
                      className="transition-colors hover:bg-surface-2"
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
                              className="size-11"
                              title={t("shiftsDeleteTitle")}
                              aria-label={t("shiftsDeleteShiftAria")}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("shiftsDeleteTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("shiftsDeleteDesc", {
                                  name: String(s.name),
                                })}
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
            className="flex flex-wrap gap-4 items-end rounded-xl border border-border bg-surface-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!shiftName.trim()) return;
              try {
                await saveShift({
                  name: shiftName.trim(),
                  hoursPerDay: readNumericInput(shiftHours, 8, { min: 1, max: 24 }),
                });
                setShiftName("");
                setShiftHours("8");
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
              <NumberInput
                id="shiftHours"
                min={1}
                max={24}
                value={shiftHours}
                onChange={(e) => setShiftHours(e.target.value)}
                className="w-24 min-h-[44px]"
              />
            </div>
            <Button type="submit" className={btnPrimaryClass}>
              {t("shiftsFormSubmit")}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          icon={CalendarDays}
          title={`${t("setgShiftsStep", { n: 2 })} · ${t("shiftsSundayCardTitle")}`}
          description={t("shiftsSundayCardSubtitle")}
        >
          <div className="w-full overflow-x-auto rounded-xl border border-border">
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
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-base text-muted-foreground"
                    >
                      {t("shiftsSundayEmptyHint")}
                    </TableCell>
                  </TableRow>
                ) : (
                  sundayCategories.map((c) => (
                    <TableRow
                      key={c.id as string}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <TableCell className="font-medium">
                        {c.name as string}
                      </TableCell>
                      <TableCell className="text-base leading-relaxed">
                        {describeSundayRule(resolveSundayCategoryRule(c), t)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-[44px] px-4 py-3 text-base"
                          onClick={() => {
                            setEditingId(c.id);
                            setCategoryName(c.name);
                            setCategoryRule(resolveSundayCategoryRule(c));
                          }}
                        >
                          <Pencil data-icon="inline-start" aria-hidden />
                          {t("ruleEdit")}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="size-11"
                              title={t("shiftsSundayDeleteTitle")}
                              aria-label={t("shiftsSundayDeleteCatAria")}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("shiftsSundayDeleteTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("shiftsSundayDeleteDesc", {
                                  name: String(c.name),
                                })}
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
                                    await deleteSundayCategory(c.id as string);
                                    await load();
                                    toast.success(
                                      t("shiftsSundayDeleteSuccess"),
                                    );
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <form
            className="flex w-full min-w-0 flex-col gap-5 rounded-xl border border-border bg-surface-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!categoryName.trim()) return;
              try {
                // The rule is stored whole. Legacy `mode` fields are never
                // written for a row saved here — an edited legacy category
                // keeps them alongside so an older build can still read it.
                const existing = editingId
                  ? sundayCategories.find((c) => c.id === editingId)
                  : undefined;
                await saveSundayCategory({
                  ...(existing ?? {}),
                  id: editingId ?? undefined,
                  name: categoryName.trim(),
                  rule: normalizeSundayRule(categoryRule),
                });
                resetCategoryForm();
                await load();
                toast.success(
                  editingId
                    ? t("ruleSaveSuccess")
                    : t("shiftsSundayAddSuccess"),
                );
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
                className="w-full max-w-sm min-h-[44px]"
                required
              />
            </div>

            <SundayRuleEditor value={categoryRule} onChange={setCategoryRule} t={t} />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" className={btnPrimaryClass}>
                {editingId ? (
                  <Save data-icon="inline-start" aria-hidden />
                ) : (
                  <Plus data-icon="inline-start" aria-hidden />
                )}
                {editingId ? t("ruleSaveEdit") : t("shiftsSundayFormSubmit")}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  className={btnPrimaryClass}
                  onClick={resetCategoryForm}
                >
                  <X data-icon="inline-start" aria-hidden />
                  {t("ruleCancelEdit")}
                </Button>
              ) : null}
            </div>
          </form>
        </SettingsSection>

        <SettingsSection
          icon={Timer}
          title={`${t("setgShiftsStep", { n: 3 })} · ${t("capCardTitle")}`}
          description={t("capCardSubtitle")}
        >
          <form
            className="flex w-full min-w-0 flex-col gap-5 rounded-xl border border-border bg-surface-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!dayPayCapDraft) return;
              setSavingDayPayCap(true);
              try {
                await saveAppSettings({
                  maxDayPayFraction: normalizeDayPayCap(dayPayCapDraft.value),
                });
                await load();
                toast.success(t("capSaveSuccess"));
              } catch {
                toast.error(t("capSaveFail"));
              } finally {
                setSavingDayPayCap(false);
              }
            }}
          >
            <DayPayCapEditor
              value={dayPayCapDraft?.value ?? null}
              onChange={(next) => setDayPayCapDraft({ value: next })}
              exampleHoursPerDay={(shifts[0]?.hoursPerDay as number) ?? 8}
              t={t}
            />
            <div>
              <Button
                type="submit"
                className={btnPrimaryClass}
                disabled={savingDayPayCap}
              >
                <Save data-icon="inline-start" aria-hidden />
                {t("capSave")}
              </Button>
            </div>
          </form>
        </SettingsSection>
      </main>
    </AppShell>
  );
}
