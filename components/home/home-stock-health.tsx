"use client";

import { Warehouse } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { HomeCard } from "@/components/home/home-card";
import { HealthDonut, type DonutSegment } from "@/components/inventory/charts";
import { stockStatusMeta, type StockStatus } from "@/components/inventory/shared";
import { summarizeStockHealth, type HomeStockRecord } from "@/lib/utils/homeDashboard";
import { number } from "@/lib/utils/formatter";

/**
 * The question: **are we short of anything?**
 *
 * Part-to-whole at a glance over exactly three ordered states, which is what a
 * donut is for. It is the same `HealthDonut` the inventory dashboard draws, and
 * the labels and colours come from `stockStatusMeta` — the single source the
 * rest of the app reads — so a badge on /inventory and a slice here can never
 * say different things about the same item.
 */

const ORDER: StockStatus[] = ["ok", "low", "out"];

const STROKE: Record<StockStatus, string> = {
  ok: "stroke-success",
  low: "stroke-warning",
  out: "stroke-destructive",
};

export interface HomeStockHealthProps {
  /** Rows from `getStockLevels`. `null` while loading. */
  levels: HomeStockRecord[] | null;
  className?: string;
}

export function HomeStockHealth({ levels, className }: HomeStockHealthProps) {
  const { t } = useLanguage();

  const shell = {
    title: t("homeStockTitle"),
    icon: Warehouse,
    href: "/inventory",
    linkLabel: t("homeStockGo"),
    className,
  };

  if (!levels) return <HomeCard {...shell} loading />;

  const health = summarizeStockHealth(levels);

  if (health.total === 0) {
    return (
      <HomeCard
        {...shell}
        empty={{ title: t("homeStockEmpty"), hint: t("homeStockEmptyHint") }}
      />
    );
  }

  const segments: DonutSegment[] = ORDER.map((status) => ({
    key: status,
    label: t(stockStatusMeta(status).labelKey),
    value: status === "ok" ? health.ok : status === "low" ? health.low : health.out,
    colorClassName: STROKE[status],
  }));

  const sentence =
    health.needsAttention > 0
      ? t("homeStockNeeds", { count: number(health.needsAttention) })
      : t("homeStockAllOk", { count: number(health.ok) });

  return (
    <HomeCard {...shell}>
      <HealthDonut
        segments={segments}
        centerLabel={t("homeStockCenterLabel")}
        centerValue={number(health.total)}
      />
      {/* Text equivalent: the one line that says whether to go and buy. */}
      <p className="text-base text-foreground">{sentence}</p>
    </HomeCard>
  );
}
