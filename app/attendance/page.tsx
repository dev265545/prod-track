"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, CheckCheck, Info, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useLanguage } from "@/components/language-provider";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { RosterRowCard } from "@/components/attendance/roster-row";
import { RosterSummaryBar } from "@/components/attendance/roster-summary";
import {
  getAllAttendanceByDate,
  saveAttendance,
} from "@/lib/services/attendanceService";
import { getEmployees } from "@/lib/services/employeeService";
import { getHolidayByDate } from "@/lib/services/factoryHolidayService";
import { getShifts } from "@/lib/services/shiftService";
import {
  BULK_FILL_CONCURRENCY,
  buildAttendancePayload,
  buildRoster,
  getDayKind,
  rowsToFillPresent,
  runWithConcurrency,
  summarizeRoster,
  type RosterMark,
  type RosterRow,
} from "@/lib/utils/attendanceRoster";
import { formatDisplayDate, today, yesterday } from "@/lib/utils/date";

/**
 * Date-first attendance roster — the screen the operator opens every morning.
 *
 * Marking a 30-person shift used to mean 30 round trips through the employee
 * detail page. Here the date is chosen once and every person is one tap away on
 * a single screen, with no navigation and no reload.
 *
 * **Writes are optimistic, per row, with rollback.** The alternative — batching
 * behind a Save button — was rejected because the failure it invites is worse
 * than the one it prevents: an operator who marks thirty people and closes the
 * app without pressing Save loses the whole day, silently, and payroll then
 * reads every one of them as absent. Each tap is a single small upsert, so the
 * per-row cost is negligible. When a write does fail the row snaps back to what
 * it was and an error names the person, so what is on screen is never something
 * the database disagrees with.
 */

export default function AttendancePage() {
  const { t, locale } = useLanguage();
  const { ready: guardReady } = useAuthGuard();

  const [date, setDate] = React.useState(() => today());
  const [rows, setRows] = React.useState<RosterRow[]>([]);
  const [holidayDates, setHolidayDates] = React.useState<string[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  /** Bumped by the error card's "Try again" to re-run the load effect. */
  const [retryKey, setRetryKey] = React.useState(0);
  const [pendingIds, setPendingIds] = React.useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = React.useState(false);
  const [holidayUnlocked, setHolidayUnlocked] = React.useState(false);

  /**
   * Per-employee write counter. Tapping "here" then "not here" quickly fires two
   * writes; without this the slower one's rollback could resurrect a stale
   * answer. A response only touches state if it is still the newest.
   */
  const writeSeq = React.useRef(new Map<string, number>());

  /**
   * Bumped whenever the displayed day changes. A bulk fill captures it and
   * reports nothing if it no longer matches: the rows it wrote belong to a date
   * that is no longer on screen, so neither "30 people marked" nor a failure
   * count would be about anything the operator can see.
   */
  const dayToken = React.useRef(0);

  /** Reads everything the roster needs for one date. Pure — the caller stores it. */
  const load = React.useCallback(async (forDate: string) => {
    const [employees, shifts, attendance, holiday] = await Promise.all([
      getEmployees(true),
      getShifts(),
      getAllAttendanceByDate(forDate),
      getHolidayByDate(forDate),
    ]);

    const shiftsById = Object.fromEntries(
      shifts.map((s) => [
        s.id as string,
        {
          name: s.name as string | undefined,
          hoursPerDay: s.hoursPerDay as number | undefined,
        },
      ]),
    );

    return {
      holidayDates: holiday ? [forDate] : [],
      rows: buildRoster({
        employees: employees.map((e) => ({
          id: e.id as string,
          name: String(e.name ?? ""),
          shiftId: e.shiftId as string | undefined,
          isActive: e.isActive as boolean | undefined,
          employeeType: e.employeeType as string | undefined,
        })),
        attendance: attendance.map((a) => ({
          id: a.id as string | undefined,
          employeeId: a.employeeId as string,
          date: a.date as string,
          status: a.status as string,
          hoursReduced: a.hoursReduced as number | undefined,
          hoursExtra: a.hoursExtra as number | undefined,
        })),
        shiftsById,
      }),
    };
  }, []);

  React.useEffect(() => {
    if (!guardReady) return;
    let cancelled = false;
    void load(date)
      .then((result) => {
        // `cancelled` guards a slower read for a date the operator has left.
        if (cancelled) return;
        setHolidayDates(result.holidayDates);
        setRows(result.rows);
        setLoaded(true);
      })
      // Without this the read simply never resolved `loaded`, so a failure was
      // an eternal skeleton — indistinguishable from a slow disk. Loading,
      // empty and failed are three different things and now look like it.
      .catch((err) => {
        if (cancelled) return;
        console.error("attendance: load failed", err);
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [guardReady, date, load, retryKey]);

  /**
   * Changing the day resets the screen *before* the load starts, so a slow read
   * can never leave yesterday's marks on screen under today's date. In-flight
   * writes are abandoned by clearing the sequence map: their rollbacks belong to
   * a date that is no longer displayed.
   */
  const changeDate = React.useCallback((next: string) => {
    if (!next) return;
    writeSeq.current.clear();
    dayToken.current += 1;
    setLoaded(false);
    setLoadFailed(false);
    setHolidayUnlocked(false);
    setRows([]);
    setDate(next);
  }, []);

  const replaceRow = React.useCallback((next: RosterRow) => {
    setRows((current) =>
      current.map((r) => (r.employeeId === next.employeeId ? next : r)),
    );
  }, []);

  /** Optimistically show `next`, write it, and put `previous` back on failure. */
  const persist = React.useCallback(
    async (previous: RosterRow, next: RosterRow): Promise<boolean> => {
      const { employeeId } = next;
      const seq = (writeSeq.current.get(employeeId) ?? 0) + 1;
      writeSeq.current.set(employeeId, seq);

      replaceRow(next);
      setPendingIds((ids) => [...ids, employeeId]);

      try {
        const saved = await saveAttendance(
          buildAttendancePayload({
            employeeId,
            date,
            mark: next.mark!,
            hoursExtra: next.hoursExtra,
            hoursReduced: next.hoursReduced,
            recordId: next.recordId,
          }),
        );
        // A newer tap already owns this row; leave its state alone.
        if (writeSeq.current.get(employeeId) !== seq) return true;
        replaceRow({ ...next, recordId: saved.id as string });
        return true;
      } catch (error) {
        console.error("[attendance] save failed", { employeeId, date }, error);
        // Superseded by a newer tap, or the day was switched out from under it:
        // this row is no longer on screen to roll back, and an error naming it
        // would only confuse.
        if (writeSeq.current.get(employeeId) !== seq) return true;
        replaceRow(previous);
        return false;
      } finally {
        setPendingIds((ids) => {
          const at = ids.indexOf(employeeId);
          if (at === -1) return ids;
          return [...ids.slice(0, at), ...ids.slice(at + 1)];
        });
      }
    },
    [date, replaceRow],
  );

  const handleMark = React.useCallback(
    async (row: RosterRow, mark: RosterMark) => {
      const next: RosterRow = {
        ...row,
        mark,
        // Switching to an absence drops the day's hour adjustments, matching
        // what `buildAttendancePayload` stores.
        hoursExtra: mark === "present" ? row.hoursExtra : 0,
        hoursReduced: mark === "present" ? row.hoursReduced : 0,
      };
      const ok = await persist(row, next);
      if (!ok) toast.error(t("rostSaveFailed", { name: row.name }));
    },
    [persist, t],
  );

  const handleHours = React.useCallback(
    async (
      row: RosterRow,
      hours: { hoursExtra: number; hoursReduced: number },
    ) => {
      const ok = await persist(row, { ...row, ...hours });
      if (ok) toast.success(t("rostHoursSaved", { name: row.name }));
      else toast.error(t("rostSaveFailed", { name: row.name }));
    },
    [persist, t],
  );

  /**
   * The day's biggest lever: most days, most people are here, so the operator
   * fills the whole roster in one tap and then corrects only the exceptions.
   * It touches unmarked rows only — see `rowsToFillPresent`.
   *
   * The writes run a few at a time rather than one after another. Thirty
   * sequential round trips is thirty waits the operator sits through, and there
   * was never a reason for them to be sequential: each target is a *different*
   * employee, so no two of these writes touch the same row, and
   * `saveAttendance` now queues per `(employee, date)` anyway, so even an
   * overlap with a tap cannot duplicate a day. Unbounded would be the wrong
   * cure — see `BULK_FILL_CONCURRENCY`.
   *
   * Every target is attempted even after one fails, and each failure has
   * already rolled its own row back to "not written yet", so the count in the
   * message and the blanks left on screen are the same people. A batch with any
   * failure is never reported as done.
   */
  const handleMarkAllPresent = React.useCallback(async () => {
    const targets = rowsToFillPresent(rows);
    if (targets.length === 0) return;
    const token = dayToken.current;
    setBulkSaving(true);
    let failed: number;
    try {
      ({ failed } = await runWithConcurrency(
        targets,
        BULK_FILL_CONCURRENCY,
        (row) => persist(row, { ...row, mark: "present" }),
      ));
    } finally {
      setBulkSaving(false);
    }
    // The operator moved to another day mid-batch: none of these rows are on
    // screen, so saying anything about them would be a message about nothing.
    if (dayToken.current !== token) return;
    if (failed > 0) toast.error(t("rostBulkFailed", { count: failed }));
    else toast.success(t("rostMarkAllDone", { count: targets.length }));
  }, [persist, rows, t]);

  const summary = React.useMemo(() => summarizeRoster(rows), [rows]);
  const dayKind = getDayKind(date, holidayDates);
  const blocked = dayKind === "holiday" && !holidayUnlocked;
  const remaining = summary.unmarked;

  if (!guardReady) {
    return (
      <AppShell>
        <main id="main" className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 max-w-full rounded-lg" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main id="main" className="flex min-w-0 flex-col gap-6 animate-fade-in">
        {/* No `action`: the two buttons this screen could promote are both
            scoped to something below them. "Mark everyone here" is a bulk
            write over the rows for the chosen date, and the date is picked in
            the card directly under this header — hoisting the button would
            put the write ahead of the control that scopes it in reading order
            and in tab order both. The holiday unlock is a gate on the notice
            that explains it, and only exists on holidays. */}
        <PageHeader title={t("rostPageTitle")} intro={t("rostPageIntro")} />

        {/* Date first: this is the one thing chosen per session. */}
        <Card className="border-border">
          <CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-col gap-1.5 sm:w-[220px]">
              <Label
                htmlFor="roster-date"
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                {t("rostDayLabel")}
              </Label>
              <DatePicker
                id="roster-date"
                value={date}
                onChange={changeDate}
                max={today()}
                className="min-h-[44px]"
              />
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <Button
                type="button"
                variant={date === today() ? "default" : "outline"}
                className="min-h-[44px] px-4"
                onClick={() => changeDate(today())}
              >
                {t("rostDayToday")}
              </Button>
              <Button
                type="button"
                variant={date === yesterday() ? "default" : "outline"}
                className="min-h-[44px] px-4"
                onClick={() => changeDate(yesterday())}
              >
                {t("rostDayYesterday")}
              </Button>
            </div>
            <p className="min-w-0 flex-1 text-sm font-medium text-foreground sm:text-right">
              {formatDisplayDate(date, locale)}
            </p>
          </CardContent>
        </Card>

        {dayKind === "sunday" ? (
          <p className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span className="min-w-0">{t("rostSundayNote")}</span>
          </p>
        ) : null}

        {dayKind === "holiday" ? (
          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4">
            <div className="flex min-w-0 items-start gap-2">
              <Info
                className="mt-0.5 size-5 shrink-0 text-warning"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-heading text-base font-semibold text-foreground">
                  {t("rostHolidayTitle")}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {holidayUnlocked
                    ? t("rostHolidayUnlocked")
                    : t("rostHolidayBody")}
                </p>
              </div>
            </div>
            {!holidayUnlocked ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] self-start px-4"
                onClick={() => setHolidayUnlocked(true)}
              >
                {t("rostHolidayUnlock")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Failed is checked BEFORE empty: a read that threw must never be
            reported as "no people on the roster". */}
        {loadFailed ? (
          <LoadError
            onRetry={() => {
              setLoaded(false);
              setRetryKey((n) => n + 1);
            }}
          />
        ) : !loaded ? (
          <>
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </>
        ) : rows.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>{t("rostNoPeople")}</EmptyTitle>
              <EmptyDescription>{t("rostNoPeopleDesc")}</EmptyDescription>
            </EmptyHeader>
            <Button asChild className="mt-4 min-h-[44px] px-4">
              <Link href="/employees">
                <UsersRound data-icon="inline-start" aria-hidden />
                {t("rostGoToPeople")}
              </Link>
            </Button>
          </Empty>
        ) : (
          <>
            <RosterSummaryBar summary={summary} />

            {remaining > 0 && !blocked ? (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Button
                  type="button"
                  onClick={handleMarkAllPresent}
                  disabled={bulkSaving}
                  className="min-h-[60px] w-full justify-center px-4 text-base font-semibold"
                >
                  {bulkSaving ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      {t("rostMarkAllWorking")}
                    </>
                  ) : (
                    <>
                      <CheckCheck
                        data-icon="inline-start"
                        className="size-5"
                        aria-hidden
                      />
                      {remaining === summary.total
                        ? t("rostMarkAllEveryone")
                        : t("rostMarkAllRest", { count: remaining })}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("rostMarkAllHint")}
                </p>
              </div>
            ) : null}

            <ul className="min-w-0 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {rows.map((row, index) => (
                <RosterRowCard
                  key={row.employeeId}
                  row={row}
                  index={index}
                  pending={pendingIds.includes(row.employeeId)}
                  disabled={blocked || bulkSaving}
                  onMark={(mark) => void handleMark(row, mark)}
                  onHoursChange={(hours) => void handleHours(row, hours)}
                />
              ))}
            </ul>
          </>
        )}
      </main>
    </AppShell>
  );
}
