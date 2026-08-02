"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LoadError } from "@/components/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isAdmin } from "@/lib/auth";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import {
  getEmployees,
  saveEmployee,
  deleteEmployee,
} from "@/lib/services/employeeService";
import { getShifts } from "@/lib/services/shiftService";
import {
  getSundayCategories,
  type SundayCategory,
} from "@/lib/services/sundayCategoryService";
import { toast } from "sonner";
import { CalendarCheck, Trash2 } from "lucide-react";
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
import { useLanguage } from "@/components/language-provider";

const HEADING_CLASS =
  "text-lg sm:text-xl font-semibold text-foreground font-heading";

export default function EmployeesPage() {
  const { t } = useLanguage();
  const { ready: guardReady } = useAuthGuard();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const ready = guardReady && dataLoaded;
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [sundayCategories, setSundayCategories] = useState<SundayCategory[]>(
    [],
  );
  const [employeeName, setEmployeeName] = useState("");
  const [employeeType, setEmployeeType] = useState<
    "salaried" | "production" | "operator"
  >("salaried");
  const [submitting, setSubmitting] = useState(false);
  const admin = isAdmin();

  const load = async () => {
    const [list, shiftList, sundayCategoryList] = await Promise.all([
      getEmployees(false),
      getShifts(),
      getSundayCategories(),
    ]);
    setEmployees(list);
    setShifts(shiftList);
    setSundayCategories(sundayCategoryList);
  };

  /**
   * `load()` had no catch, and `ready` waits on `dataLoaded` — so a failed read
   * showed the skeleton for ever. Failed is now its own state with a retry.
   */
  const retry = useCallback(() => {
    setLoadFailed(false);
    load()
      .then(() => setDataLoaded(true))
      .catch((err) => {
        console.error("people: load failed", err);
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
        <main id="main" className="flex flex-col gap-8">
          <LoadError onRetry={retry} />
        </main>
      </AppShell>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeName.trim()) return;
    setSubmitting(true);
    try {
      try {
        await saveEmployee({
          name: employeeName.trim(),
          isActive: true,
          employeeType,
          employeeTypeConfirmed: true,
        });
      } catch {
        toast.error(t("employeesAddFail"));
        return;
      }
      setEmployeeName("");
      setEmployeeType("salaried");
      await load();
      toast.success(t("employeesAddSuccess"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <AppShell>
        <main id="main" className="flex flex-col gap-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 rounded-2xl" />
        </main>
      </AppShell>
    );
  }

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, s])
  ) as Record<string, Record<string, unknown>>;
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id as string, c]),
  ) as Record<string, SundayCategory>;

  return (
    <AppShell>
      <main id="main" className="flex flex-col gap-10 animate-fade-in">
        {/* Setup screen, not a daily one: say so, and point the daily job at
            the roster so this page stops reading as "attendance". */}
        <PageHeader
          title={t("rostPeopleTitle")}
          intro={t("rostPeopleIntro")}
          action={
            <Button asChild variant="outline" className="min-h-[44px] px-4">
              <Link href="/attendance">
                <CalendarCheck data-icon="inline-start" aria-hidden />
                {t("rostPeopleToRoster")}
              </Link>
            </Button>
          }
        />

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className={HEADING_CLASS}>{t("employeesListTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
          {employees.length === 0 ? (
            <Empty className="py-10 border-0">
              <EmptyHeader>
                <EmptyTitle>{t("employeesNoYet")}</EmptyTitle>
                <EmptyDescription>
                  {t("employeesNoYetDesc")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <Table className="min-w-[400px]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t("employeesColName")}</TableHead>
                    <TableHead scope="col">{t("employeesColType")}</TableHead>
                    <TableHead scope="col">{t("employeesColShift")}</TableHead>
                    <TableHead scope="col">{t("employeesColSundayCat")}</TableHead>
                    <TableHead scope="col">{t("employeesColStatus")}</TableHead>
                    <TableHead className="w-[64px]" scope="col">
                      <span className="sr-only">{t("commonActions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((e) => (
                    // The whole row used to be `role="button"` with a Select
                    // and a delete dialog nested inside it — invalid
                    // nested-interactive markup that destroyed the row/cell
                    // semantics (a screen reader read six cells as one button
                    // label) and needed stopPropagation on every cell to stop
                    // changing a pay type from navigating away. The link now
                    // lives in the one cell that names the person.
                    <TableRow
                      key={e.id as string}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <TableHead
                        scope="row"
                        className="h-auto p-4 font-medium text-foreground"
                      >
                        <Link
                          href={`/employee?id=${encodeURIComponent(String(e.id))}`}
                          aria-label={t("employeesViewAria", {
                            name: String(e.name),
                          })}
                          className="flex min-h-[44px] items-center rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {e.name as string}
                        </Link>
                      </TableHead>
                      <TableCell className="text-muted-foreground">
                        <Select
                          value={(e.employeeType as string) ?? "salaried"}
                          // Changing this changes how the person is paid, so
                          // it confirms like every other write on this screen.
                          // It used to be silent on both paths: a failed save
                          // just snapped the box back with no explanation.
                          onValueChange={async (v) => {
                            try {
                              await saveEmployee({
                                ...e,
                                employeeType: v,
                                employeeTypeConfirmed: true,
                              });
                              await load();
                              toast.success(t("ux2PayTypeSaved"));
                            } catch (err) {
                              console.error("people: pay type save failed", err);
                              toast.error(t("ux2PayTypeSaveFailed"));
                            }
                          }}
                        >
                          <SelectTrigger className="w-36 min-h-[44px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="salaried">
                              {t("employeeTypeSalaried")}
                            </SelectItem>
                            <SelectItem value="production">
                              {t("employeeTypeProduction")}
                            </SelectItem>
                            {(admin || e.employeeType === "operator") && (
                              <SelectItem value="operator">
                                {t("employeeTypeOperator")}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(e.shiftId as string)
                          ? (shiftMap[e.shiftId as string]?.name as string) ?? "—"
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(e.sundayCategoryId as string)
                          ? (sundayCategoryMap[e.sundayCategoryId as string]
                              ?.name as string) ?? t("employeesSundayDefault")
                          : t("employeesSundayDefault")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(e.isActive as boolean) !== false
                          ? t("employeesStatusActive")
                          : t("employeesStatusInactive")}
                      </TableCell>
                      <TableCell className="w-[64px]">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="size-11"
                              title={t("employeesDeleteTitle")}
                              aria-label={t("employeesDeleteEmployeeAria", {
                                name: String(e.name),
                              })}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("employeesDeleteTitle")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("employeesDeleteDesc", {
                                  name: String(e.name),
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
                                    await deleteEmployee(e.id as string);
                                    await load();
                                    toast.success(t("employeesDeleteSuccess"));
                                  } catch {
                                    toast.error(t("employeesDeleteFail"));
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={HEADING_CLASS}>{t("employeesAddTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
          <form
            className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-end"
            onSubmit={handleAdd}
          >
            <div className="flex flex-col gap-2 flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="employee-name">{t("employeesNameLabel")}</Label>
              <Input
                id="employee-name"
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder={t("employeesNamePlaceholder")}
                className="min-h-[44px]"
                required
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2 min-w-0 sm:min-w-[180px]">
              <Label htmlFor="employee-type">{t("employeesColType")}</Label>
              <Select
                value={employeeType}
                onValueChange={(v) =>
                  setEmployeeType(v as "salaried" | "production" | "operator")
                }
              >
                <SelectTrigger id="employee-type" className="min-h-[44px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salaried">
                    {t("employeeTypeSalaried")}
                  </SelectItem>
                  <SelectItem value="production">
                    {t("employeeTypeProduction")}
                  </SelectItem>
                  {admin && (
                    <SelectItem value="operator">
                      {t("employeeTypeOperator")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="min-h-[44px] px-6 py-3 text-base" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  {t("employeesAdding")}
                </>
              ) : (
                t("employeesAddButton")
              )}
            </Button>
          </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
