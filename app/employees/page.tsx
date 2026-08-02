"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
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
  const router = useRouter();
  const { t } = useLanguage();
  const { ready: guardReady } = useAuthGuard();
  const [dataLoaded, setDataLoaded] = useState(false);
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

  useEffect(() => {
    if (!guardReady) return;
    load().then(() => setDataLoaded(true));
  }, [guardReady]);

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
        <div className="flex flex-col gap-3 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-heading">
            {t("rostPeopleTitle")}
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("rostPeopleIntro")}
          </p>
          <Button asChild variant="outline" className="min-h-[44px] self-start px-4">
            <Link href="/attendance">
              <CalendarCheck data-icon="inline-start" aria-hidden />
              {t("rostPeopleToRoster")}
            </Link>
          </Button>
        </div>

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
                    <TableRow
                      key={e.id as string}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      tabIndex={0}
                      role="button"
                      aria-label={t("employeesViewAria", {
                        name: String(e.name),
                      })}
                      onClick={() =>
                        router.push(
                          `/employee?id=${encodeURIComponent(String(e.id))}`,
                        )
                      }
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          router.push(
                            `/employee?id=${encodeURIComponent(String(e.id))}`,
                          );
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {e.name as string}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground"
                        onClick={(ev) => ev.stopPropagation()}
                        onKeyDown={(ev) => ev.stopPropagation()}
                      >
                        <Select
                          value={(e.employeeType as string) ?? "salaried"}
                          onValueChange={async (v) => {
                            await saveEmployee({
                              ...e,
                              employeeType: v,
                              employeeTypeConfirmed: true,
                            });
                            await load();
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
                      <TableCell
                        className="w-[64px]"
                        onClick={(ev) => ev.stopPropagation()}
                        onKeyDown={(ev) => ev.stopPropagation()}
                      >
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
                                onClick={async (ev) => {
                                  ev.stopPropagation();
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
