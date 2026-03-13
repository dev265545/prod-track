"use client";

import { useEffect, useState } from "react";
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
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
import {
  getEmployees,
  saveEmployee,
  deleteEmployee,
} from "@/lib/services/employeeService";
import { getShifts } from "@/lib/services/shiftService";
import { Trash2 } from "lucide-react";

const HEADING_CLASS =
  "text-lg sm:text-xl font-semibold text-foreground font-heading";

export default function EmployeesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [list, shiftList] = await Promise.all([
      getEmployees(false),
      getShifts(),
    ]);
    setEmployees(list);
    setShifts(shiftList);
  };

  useEffect(() => {
    openDB()
      .then(async () => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        await load();
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeName.trim()) return;
    setSubmitting(true);
    try {
      await saveEmployee({
        name: employeeName.trim(),
        isActive: true,
      });
      setEmployeeName("");
      await load();
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

  return (
    <AppShell>
      <main id="main" className="flex flex-col gap-10 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-heading">
          Employees
        </h1>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className={HEADING_CLASS}>Employee list</CardTitle>
          </CardHeader>
          <CardContent>
          {employees.length === 0 ? (
            <Empty className="py-10 border-0">
              <EmptyHeader>
                <EmptyTitle>No employees yet</EmptyTitle>
                <EmptyDescription>
                  Add one below to get started.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <Table className="min-w-[400px]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Name</TableHead>
                    <TableHead scope="col">Shift</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead className="w-[52px]" scope="col">
                      <span className="sr-only">Actions</span>
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
                      aria-label={`View details for ${e.name as string}`}
                      onClick={() => router.push(`/employee/${e.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          router.push(`/employee/${e.id}`);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {e.name as string}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(e.shiftId as string)
                          ? (shiftMap[e.shiftId as string]?.name as string) ?? "—"
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(e.isActive as boolean) !== false
                          ? "Active"
                          : "Inactive"}
                      </TableCell>
                      <TableCell
                        className="w-[52px]"
                        onClick={(ev) => ev.stopPropagation()}
                        onKeyDown={(ev) => ev.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          title="Delete employee"
                          aria-label={`Delete ${e.name as string}`}
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            if (
                              confirm(
                                "Delete this employee? Their productions and advances will remain but show as unknown.",
                              )
                            ) {
                              await deleteEmployee(e.id as string);
                              load();
                            }
                          }}
                        >
                          <Trash2 data-icon="inline-start" aria-hidden />
                        </Button>
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
            <CardTitle className={HEADING_CLASS}>Add employee</CardTitle>
          </CardHeader>
          <CardContent>
          <form
            className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-end"
            onSubmit={handleAdd}
          >
            <div className="flex flex-col gap-2 flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="employee-name">Name</Label>
              <Input
                id="employee-name"
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Employee name"
                className="min-h-[44px]"
                required
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            <Button type="submit" className="min-h-[44px] px-6 py-3 text-base" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Adding…
                </>
              ) : (
                "Add employee"
              )}
            </Button>
          </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
