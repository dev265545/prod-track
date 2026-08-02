"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/language-provider";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { visibleModules, type ModuleId } from "@/components/navigation";
import { HomeActions } from "@/components/home/home-actions";
import {
  HomeAttentionList,
  type HomeAttentionItem,
} from "@/components/home/home-attention-list";
import { HomeProductionTrendCard } from "@/components/home/home-production-trend";
import { HomeAttendanceGlance } from "@/components/home/home-attendance-glance";
import { HomeStockHealth } from "@/components/home/home-stock-health";
import { getEmployees } from "@/lib/services/employeeService";
import { getShifts } from "@/lib/services/shiftService";
import { getProductionsInRange } from "@/lib/services/productionService";
import { getStockLevels } from "@/lib/services/inventoryService";
import { getAllAttendanceByDate } from "@/lib/services/attendanceService";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import { buildRoster, summarizeRoster } from "@/lib/utils/attendanceRoster";
import { getMissingDataForAllEmployees } from "@/lib/utils/missingDataWarnings";
import {
  buildProductionTrend,
  buildTrendWindow,
  summarizeStockHealth,
  type HomeProductionTrend,
  type HomeRosterSummary,
  type HomeStockRecord,
} from "@/lib/utils/homeDashboard";
import { formatDisplayDate, getPeriodForDate, today } from "@/lib/utils/date";
import { number } from "@/lib/utils/formatter";

/**
 * The home dashboard.
 *
 * Order on the screen is the order of the operator's day, not a tour of the
 * data: the three things they came to do sit at the top as thumb-sized slabs,
 * then anything that needs fixing (each row a link to the fix), then three
 * cards that each answer one question — is the work going up or down, did
 * anyone not get marked, are we short of anything — and only then the full
 * module list for the rarer trips.
 *
 * Role: this screen reads no money at all. `getSalarySheetForRange` builds a
 * row per employee and is the most expensive call in the app, so the fix for
 * the old leak (a salary table rendering under a worker session) is not to
 * hide the panel but to never have the number on the client: the only payroll
 * affordance here is a link, and `HomeActions` only draws it for an admin.
 *
 * Loading is two waves. The first fetches everything the cards draw, in
 * parallel; the "needs attention" scan walks the whole period per employee, so
 * it runs afterwards and lands into a card that is already on screen showing
 * its own skeleton. Nothing blocks the call-to-action buttons, which are
 * static links and paint immediately.
 */

/** How many days the trend line covers. Two weeks reads as a shape, not noise. */
const TREND_DAYS = 14;

/** One short, plain line of live data per module card. */
interface HubStats {
  employees: number;
  producedToday: number;
  stockItems: number;
  lowStock: number;
  periodLabel: string;
}

interface DashboardData {
  stats: HubStats;
  trend: HomeProductionTrend;
  roster: HomeRosterSummary;
  levels: HomeStockRecord[];
}

export default function Home() {
  const { t, locale } = useLanguage();
  // Role is read after mount by the guard, never during render — reading the
  // session while rendering makes the first paint disagree with the client and
  // can flash admin-only affordances at a worker.
  const { ready, role } = useAuthGuard();
  const admin = role === "admin";

  const [data, setData] = useState<DashboardData | null>(null);
  const [attention, setAttention] = useState<HomeAttentionItem[] | null>(null);

  /**
   * Wave one: everything the three cards draw. Pure — it returns what it read
   * and the effect stores it, so a read that finishes after the operator has
   * navigated away cannot write into a dead screen.
   */
  const loadCore = useCallback(async () => {
    const date = today();
    const period = getPeriodForDate(date, locale);
    const window = buildTrendWindow(date, TREND_DAYS);

    const [employees, shifts, attendance, productions, stock, holidays] =
      await Promise.all([
        getEmployees(true),
        getShifts(),
        getAllAttendanceByDate(date),
        getProductionsInRange(window.from, window.to),
        getStockLevels(),
        getHolidaysInRange(period.from, period.to),
      ]);

    const trend = buildProductionTrend(
      productions.map((p) => ({
        date: p.date,
        quantity: p.quantity,
        shift: p.shift,
      })),
      window.dates,
    );

    const roster = summarizeRoster(
      buildRoster({
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
        shiftsById: Object.fromEntries(
          shifts.map((s) => [
            s.id as string,
            {
              name: s.name as string | undefined,
              hoursPerDay: s.hoursPerDay as number | undefined,
            },
          ]),
        ),
      }),
    );

    const levels: HomeStockRecord[] = stock.map((s) => ({
      currentStock: s.currentStock,
      lowStockThreshold: s.lowStockThreshold,
    }));
    const health = summarizeStockHealth(levels);

    return {
      data: {
        stats: {
          employees: employees.length,
          // The last point of the window *is* today, so the hub's "made today"
          // line comes free rather than costing a second read of the same store.
          producedToday: trend.latestTotal,
          stockItems: levels.length,
          lowStock: health.needsAttention,
          periodLabel: period.label,
        },
        trend,
        roster,
        levels,
      } satisfies DashboardData,
      employees,
      period,
      holidayDates: holidays.map((h) => h.date as string),
      roster,
      health,
    };
  }, [locale]);

  /**
   * Wave two: the per-employee scan across the whole payroll period. It is the
   * slowest read on the screen and nothing above depends on it, so it runs
   * after the cards are already drawn, into a list showing its own skeleton.
   */
  const loadAttention = useCallback(
    async (core: Awaited<ReturnType<typeof loadCore>>) => {
      const { employees, period, holidayDates, roster, health } = core;
      const missing = await getMissingDataForAllEmployees(
        employees.map((e) => ({
          id: e.id as string,
          createdAt: e.createdAt as string | undefined,
        })),
        period.from,
        period.to,
        holidayDates,
      );
      const missingDays = Array.from(missing.values()).reduce(
        (sum, days) => sum + days.length,
        0,
      );
      const unconfirmed = employees.filter(
        (e) => e.employeeTypeConfirmed !== true,
      ).length;

      const items: HomeAttentionItem[] = [];
      if (roster.unmarked > 0) {
        items.push({
          key: "attendance",
          label: t("homeAttRemaining", { count: number(roster.unmarked) }),
          href: "/attendance",
        });
      }
      if (missingDays > 0) {
        items.push({
          key: "missing",
          label: t("homeMissingEntries", { count: number(missingDays) }),
          href: "/production",
        });
      }
      if (unconfirmed > 0) {
        items.push({
          key: "types",
          label: t("homeUnconfirmedTypes", { count: number(unconfirmed) }),
          href: "/employees",
        });
      }
      if (health.needsAttention > 0) {
        items.push({
          key: "stock",
          label: t("homeStockNeeds", { count: number(health.needsAttention) }),
          href: "/inventory",
          // An item at zero stops the line; running low only warns.
          tone: health.out > 0 ? "destructive" : "warning",
        });
      }
      return items;
    },
    [t],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void loadCore()
      .then((core) => {
        if (cancelled) return;
        setData(core.data);
        return loadAttention(core).then((items) => {
          if (!cancelled) setAttention(items);
        });
      })
      .catch((error) => {
        // A failed read must not leave the cards spinning for ever: the
        // attention list falls back to its all-clear line and the operator
        // still has every call-to-action above it.
        console.error("dashboard load failed", error);
        if (!cancelled) setAttention([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadCore, loadAttention]);

  if (!ready) {
    return (
      <div
        className="flex min-h-svh w-full items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-label={t("loading")}
      >
        <div className="flex flex-col items-center justify-center gap-6 animate-loading-screen-in">
          <Spinner className="size-16 text-primary stroke-[1.5]" />
          <span className="animate-loading-screen-in-delay text-lg font-medium text-muted-foreground">
            {t("loading")}
          </span>
        </div>
      </div>
    );
  }

  /** The one live number shown on a module's card. */
  const statFor = (id: ModuleId): string | null => {
    if (!data) return null;
    const stats = data.stats;
    switch (id) {
      case "attendance":
        return t("homeStatEmployees", { count: number(stats.employees) });
      case "production":
        return t("homeStatProducedToday", {
          count: number(stats.producedToday),
        });
      case "inventory":
        return stats.lowStock > 0
          ? t("homeStatLowStock", { count: number(stats.lowStock) })
          : t("homeStatStock", { count: number(stats.stockItems) });
      case "payroll":
        return t("homeStatPeriod", { label: stats.periodLabel });
      case "settings":
        return t("homeStatSettings");
    }
  };

  const modules = visibleModules(admin);

  return (
    <AppShell>
      <main className="flex w-full min-w-0 flex-col gap-8 animate-fade-in">
        <header className="flex min-w-0 flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("homeTitle")}
          </h1>
          <p className="text-base text-muted-foreground">
            {t("homeTodayIs", { date: formatDisplayDate(today(), locale) })}
          </p>
        </header>

        {/* 1 — what they came to do. Loudest thing on the screen, and static:
            it paints before any read finishes. */}
        <HomeActions role={role} />

        {/* 2 — what is wrong, each row a door to the fix. */}
        <HomeAttentionList items={attention} />

        {/* 3 — three questions, three answers. Each card carries its own
            loading and empty state, so a brand-new factory sees a sentence
            telling it what to add rather than an axis with nothing on it. */}
        <section
          aria-label={t("homeOverviewTitle")}
          className="flex min-w-0 flex-col gap-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("homeOverviewTitle")}
          </h2>
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <HomeProductionTrendCard
              trend={data?.trend ?? null}
              className="lg:col-span-2 xl:col-span-1"
            />
            <HomeAttendanceGlance summary={data?.roster ?? null} />
            <HomeStockHealth levels={data?.levels ?? null} />
          </div>
        </section>

        {/* 4 — the full map, for the rarer trips. */}
        <section aria-label={t("homeAllSections")} className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("homeAllSections")}
          </h2>
          <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((mod) => {
              const Icon = mod.icon;
              const stat = statFor(mod.id);
              return (
                <li key={mod.id} className="min-w-0">
                  <Link
                    href={mod.href}
                    className="flex h-full min-h-[132px] min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-foreground no-underline shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {/* Solid token, not `bg-primary/10`: Tailwind compiles
                          opacity modifiers to color-mix(), which Chrome 109
                          (Windows 7) does not support and falls back to a
                          fully opaque fill, hiding the icon. */}
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-primary">
                        <Icon className="size-6" aria-hidden />
                      </span>
                      <span className="min-w-0 truncate font-heading text-xl font-semibold tracking-tight">
                        {t(mod.labelKey)}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(mod.descriptionKey)}
                    </span>
                    <span className="mt-auto text-base font-medium tabular-nums text-foreground">
                      {stat ?? (
                        <Skeleton className="inline-block h-5 w-32 rounded-md align-middle" />
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
