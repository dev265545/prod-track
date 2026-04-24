"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
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

export default function ShiftsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
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

  if (!ready) {
    return (
      <AppLoadingScreen
        title="Opening shifts…"
        description="Loading shift definitions from your database."
      />
    );
  }

  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";

  return (
    <AppShell>
      <main className="flex flex-col gap-10 animate-fade-in">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Shifts
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            Configure shift hours and Sunday earning categories used in salary
            calculations.
          </p>
        </header>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <Clock className="size-5 text-primary" />
              Shift definitions
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Day and night (or any pattern) you track on the floor.
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right tabular-nums">
                      Hours/day
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
                            No shifts yet — add your first shift below.
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
                                title="Delete shift"
                                aria-label="Delete shift"
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete shift?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete {s.name as string}? Records referencing
                                  it may lose the link.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await deleteShift(s.id as string);
                                      await load();
                                      toast.success("Shift deleted");
                                    } catch {
                                      toast.error("Failed to delete shift");
                                    }
                                  }}
                                >
                                  Delete
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
                  toast.success("Shift added");
                } catch {
                  toast.error("Failed to add shift");
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="shiftName">Name</Label>
                <Input
                  id="shiftName"
                  type="text"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder="e.g. 8AM-8PM"
                  className="w-48 min-h-[44px]"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="shiftHours">Hours per day</Label>
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
                Add shift
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold font-heading">
              <CalendarDays className="size-5 text-primary" />
              Sunday categories
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Assign one category per employee. Rule is applied per 15-day block,
              and earned Sundays are capped to 2 per block.
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="overflow-x-auto mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rule</TableHead>
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
                            No Sunday categories yet — add one below.
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
                            ? `Every ${c.everyPresentDays as number} present => ${c.earnedPerStep as number} Sunday`
                            : `${c.requiredPresent as number} present => ${c.earnedSundays as number} Sundays`}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                title="Delete category"
                                aria-label="Delete category"
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete category?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete {c.name as string}? Employees using it
                                  will fall back to default (12 present → 2).
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await deleteSundayCategory(c.id as string);
                                      await load();
                                      toast.success("Category deleted");
                                    } catch {
                                      toast.error("Failed to delete category");
                                    }
                                  }}
                                >
                                  Delete
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
                  toast.success("Sunday category added");
                } catch {
                  toast.error("Failed to add Sunday category");
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="catName">Category name</Label>
                <Input
                  id="catName"
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. 12 attendance => 2 Sundays"
                  className="w-64 min-h-[44px]"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catMode">Rule type</Label>
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
                    <SelectItem value="threshold">Threshold</SelectItem>
                    <SelectItem value="step">Step</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {categoryMode === "threshold" ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="requiredPresent">Present days needed</Label>
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
                    <Label htmlFor="earnedSundays">Sundays earned</Label>
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
                    <Label htmlFor="everyPresentDays">Every present days</Label>
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
                    <Label htmlFor="earnedPerStep">Sundays per step</Label>
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
                Add category
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
