"use client";

import { ArrowDown, ArrowUp, Check, CircleDashed, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { number } from "@/lib/utils/formatter";
import type {
  ProductionRosterRow,
  ProductionRosterSummary,
} from "@/lib/utils/productionRoster";

/**
 * "Who still has nothing written down for this day" — the production screen's
 * answer to the attendance roster's "still to write".
 *
 * These people have no attendance to mark, so an empty row here is not a
 * neutral state: it is either work nobody has entered yet or a day this person
 * genuinely did not work, and only the operator can tell the difference. It is
 * therefore given the same weight as the recorded rows, never hidden.
 */

export function ProductionSummaryBar({
  summary,
}: {
  summary: ProductionRosterSummary;
}) {
  const { t } = useLanguage();
  const done = summary.pending === 0 && summary.total > 0;

  const tiles: { key: string; label: string; value: number; valueClass: string }[] =
    [
      {
        key: "recorded",
        label: t("prodCountDone"),
        value: summary.recorded,
        valueClass: "text-success",
      },
      {
        key: "pending",
        label: t("prodCountLeft"),
        value: summary.pending,
        valueClass: "text-foreground",
      },
      {
        key: "made",
        label: t("prodCountMade"),
        value: summary.totalQty,
        valueClass: "text-primary",
      },
    ];

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p
          className="font-heading text-lg font-semibold text-foreground"
          aria-live="polite"
        >
          {done
            ? t("prodProgressDone", { total: summary.total })
            : t("prodProgress", {
                done: summary.recorded,
                total: summary.total,
              })}
        </p>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {summary.percent}%
        </p>
      </div>

      {/* Plain two-element bar: no gradients, no color-mix — Chrome 109 safe. */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={summary.recorded}
        aria-valuemin={0}
        aria-valuemax={summary.total}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            done ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${summary.percent}%` }}
        />
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface-2 px-3 py-2"
          >
            <dt className="truncate text-xs font-medium text-muted-foreground">
              {tile.label}
            </dt>
            <dd
              className={cn(
                "font-heading text-2xl font-bold tabular-nums leading-none",
                tile.valueClass,
              )}
            >
              {number(tile.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ProductionRosterList({
  rows,
  itemNames,
  onAddFor,
  disabled,
  reorderMode = false,
  savingOrder = false,
  onMove,
}: {
  rows: ProductionRosterRow[];
  /** Item id → name, for the one-line summary under each person. */
  itemNames: Record<string, string>;
  onAddFor: (employeeId: string) => void;
  disabled?: boolean;
  /**
   * When on, the row's "Add" button is replaced by the up/down arrows. The two
   * are never shown together: an operator walking the floor taps "Add" dozens
   * of times a day and must not be able to reshuffle people by missing it.
   */
  reorderMode?: boolean;
  /** A save is in flight — arrows are disabled so a double tap cannot write twice. */
  savingOrder?: boolean;
  onMove?: (employeeId: string, direction: -1 | 1) => void;
}) {
  const { t } = useLanguage();
  const firstId = rows[0]?.employeeId;
  const lastId = rows[rows.length - 1]?.employeeId;

  return (
    <ul className="min-w-0 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {rows.map((row) => (
        <li
          key={row.employeeId}
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4"
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full border",
              row.recorded
                ? "border-success bg-surface-2 text-success"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
            aria-hidden
          >
            {row.recorded ? (
              <Check className="size-5" />
            ) : (
              <CircleDashed className="size-5" />
            )}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            {row.recorded ? (
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                <span className="text-foreground tabular-nums">
                  {t("prodRowMade", { qty: number(row.totalQty) })}
                </span>
                {" · "}
                {t("prodRowShifts", {
                  day: number(row.dayQty),
                  night: number(row.nightQty),
                })}
                {row.itemIds.length > 0
                  ? " · " +
                    row.itemIds
                      .map((id) => itemNames[id] ?? id)
                      .join(", ")
                  : ""}
              </p>
            ) : (
              <p className="truncate text-sm text-muted-foreground">
                {t("prodRowNothing")}
              </p>
            )}
          </div>

          {reorderMode ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingOrder || row.employeeId === firstId}
                onClick={() => onMove?.(row.employeeId, -1)}
                aria-label={t("prodOrdMoveUp", { name: row.name })}
                className="min-h-[44px] min-w-[44px] px-3"
              >
                <ArrowUp className="size-5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={savingOrder || row.employeeId === lastId}
                onClick={() => onMove?.(row.employeeId, 1)}
                aria-label={t("prodOrdMoveDown", { name: row.name })}
                className="min-h-[44px] min-w-[44px] px-3"
              >
                <ArrowDown className="size-5" aria-hidden />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant={row.recorded ? "outline" : "default"}
              disabled={disabled}
              onClick={() => onAddFor(row.employeeId)}
              aria-label={t("prodRowAddFor", { name: row.name })}
              className="min-h-[44px] shrink-0 px-4"
            >
              <Plus data-icon="inline-start" className="size-4" aria-hidden />
              {t("prodRowAdd")}
            </Button>
          )}
        </li>
      ))}
      {rows.length === 0 ? (
        <li className="flex min-w-0 items-center gap-2 p-4 text-sm text-muted-foreground">
          <Package className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">{t("prodNoPeopleDesc")}</span>
        </li>
      ) : null}
    </ul>
  );
}
