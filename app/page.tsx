"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/language-provider";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { visibleModules, type ModuleId } from "@/components/navigation";
import { getEmployees } from "@/lib/services/employeeService";
import { getDailyAggregated } from "@/lib/services/productionService";
import { getStockLevels } from "@/lib/services/inventoryService";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import { getMissingDataForAllEmployees } from "@/lib/utils/missingDataWarnings";
import { getPeriodForDate, today } from "@/lib/utils/date";
import { number } from "@/lib/utils/formatter";
import type { MessageKey } from "@/lib/i18n/messages";

/** One short, plain line of live data per module card. */
interface HubStats {
  employees: number;
  producedToday: number;
  stockItems: number;
  lowStock: number;
  periodLabel: string;
}

interface Attention {
  labelKey: MessageKey;
  count: number;
  href: string;
}

export default function Home() {
  const { t, locale } = useLanguage();
  const { ready, role } = useAuthGuard();
  const admin = role === "admin";

  const [stats, setStats] = useState<HubStats | null>(null);
  const [attention, setAttention] = useState<Attention[]>([]);

  const load = useCallback(async () => {
    if (!ready) return;
    const date = today();
    const period = getPeriodForDate(date, locale);
    const [employees, daily, stock, holidays] = await Promise.all([
      getEmployees(true),
      getDailyAggregated(date),
      getStockLevels(),
      getHolidaysInRange(period.from, period.to),
    ]);

    const producedToday = Object.values(daily.totals).reduce(
      (sum, qty) => sum + qty,
      0,
    );

    setStats({
      employees: employees.length,
      producedToday,
      stockItems: stock.length,
      lowStock: stock.filter((s) => s.isLow).length,
      periodLabel: period.label,
    });

    const missing = await getMissingDataForAllEmployees(
      employees.map((e) => ({
        id: e.id as string,
        createdAt: e.createdAt as string | undefined,
      })),
      period.from,
      period.to,
      holidays.map((h) => h.date as string),
    );
    const missingDays = Array.from(missing.values()).reduce(
      (sum, days) => sum + days.length,
      0,
    );
    const unconfirmed = employees.filter(
      (e) => e.employeeTypeConfirmed !== true,
    ).length;

    const next: Attention[] = [];
    if (missingDays > 0) {
      next.push({
        labelKey: "homeMissingEntries",
        count: missingDays,
        href: "/production",
      });
    }
    if (unconfirmed > 0) {
      next.push({
        labelKey: "homeUnconfirmedTypes",
        count: unconfirmed,
        href: "/employees",
      });
    }
    if (stock.some((s) => s.isLow)) {
      next.push({
        labelKey: "homeStatLowStock",
        count: stock.filter((s) => s.isLow).length,
        href: "/inventory",
      });
    }
    setAttention(next);
  }, [locale, ready]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!stats) return null;
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
        <header className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("homeTitle")}
          </h1>
          <p className="text-base text-muted-foreground">{t("homeSubtitle")}</p>
        </header>

        <section
          aria-label={t("homeNeedsAttention")}
          className="rounded-lg border border-border bg-card p-4 sm:p-5"
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle
              className={
                "size-4 shrink-0 " +
                (attention.length > 0 ? "text-destructive" : "text-muted-foreground")
              }
              aria-hidden
            />
            {t("homeNeedsAttention")}
          </h2>
          {!stats ? (
            <Skeleton className="h-11 w-full max-w-md rounded-lg" />
          ) : attention.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("homeAllClear")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attention.map((a) => (
                <li key={a.labelKey}>
                  <Link
                    href={a.href}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-base text-foreground no-underline transition-colors hover:bg-muted"
                  >
                    <span>{t(a.labelKey, { count: number(a.count) })}</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t("navSections")}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((mod) => {
              const Icon = mod.icon;
              const stat = statFor(mod.id);
              return (
                <li key={mod.id}>
                  <Link
                    href={mod.href}
                    className="flex h-full min-h-[132px] flex-col gap-3 rounded-lg border border-border bg-card p-5 text-foreground no-underline shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-3">
                      {/* Solid token, not `bg-primary/10`: Tailwind compiles
                          opacity modifiers to color-mix(), which Chrome 109
                          (Windows 7) does not support and falls back to a
                          fully opaque fill, hiding the icon. */}
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-primary">
                        <Icon className="size-6" aria-hidden />
                      </span>
                      <span className="font-heading text-xl font-semibold tracking-tight">
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
