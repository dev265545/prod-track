"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock3, MinusCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { RosterMark, RosterRow } from "@/lib/utils/attendanceRoster";

/**
 * One person, one day, one tap.
 *
 * Both choices are always visible and always the same size — the operator learns
 * one target position per answer and stops reading. Each is 44px tall with an
 * icon *and* a word, because an icon alone is a guess for somebody who does not
 * read English fluently. A short day is not a third button: it is a present day
 * with hours taken off, under "Change hours" below.
 */

interface MarkOption {
  mark: RosterMark;
  labelKey: MessageKey;
  icon: typeof Check;
  /** Solid semantic fill when this is the person's answer. */
  selectedClass: string;
}

const MARK_OPTIONS: MarkOption[] = [
  {
    mark: "present",
    labelKey: "rostHere",
    icon: Check,
    selectedClass: "bg-success text-success-foreground border-success",
  },
  {
    mark: "absent",
    labelKey: "rostAway",
    icon: X,
    selectedClass:
      "bg-destructive text-destructive-foreground border-destructive",
  },
];

/** Left edge of the row — the colour the operator scans down the page. */
const ACCENT_BY_MARK: Record<RosterMark | "none", string> = {
  present: "border-l-success",
  absent: "border-l-destructive",
  none: "border-l-surface-4",
};

function parseHours(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface RosterRowCardProps {
  row: RosterRow;
  /** Position in the list, shown like a line number in a muster book. */
  index: number;
  /** A write for this person is in flight. */
  pending: boolean;
  /** Whole-day block, e.g. a factory holiday the operator has not unlocked. */
  disabled: boolean;
  onMark: (mark: RosterMark) => void;
  onHoursChange: (hours: { hoursExtra: number; hoursReduced: number }) => void;
}

export function RosterRowCard({
  row,
  index,
  pending,
  disabled,
  onMark,
  onHoursChange,
}: RosterRowCardProps) {
  const { t } = useLanguage();
  const [hoursOpen, setHoursOpen] = React.useState(false);

  /**
   * The row is the source of truth; this only holds what is part-typed. When the
   * row's saved hours change underneath (a save landing, or a rollback putting
   * the old value back) the draft is rebuilt *during render* rather than in an
   * effect, so the inputs never briefly show a value the database disagrees with.
   */
  const savedHours = `${row.hoursExtra}|${row.hoursReduced}`;
  const [draft, setDraft] = React.useState(() => ({
    savedHours,
    extra: row.hoursExtra > 0 ? String(row.hoursExtra) : "",
    less: row.hoursReduced > 0 ? String(row.hoursReduced) : "",
  }));
  if (draft.savedHours !== savedHours) {
    setDraft({
      savedHours,
      extra: row.hoursExtra > 0 ? String(row.hoursExtra) : "",
      less: row.hoursReduced > 0 ? String(row.hoursReduced) : "",
    });
  }
  const extraInput = draft.extra;
  const lessInput = draft.less;
  const setExtraInput = (value: string) =>
    setDraft((d) => ({ ...d, extra: value }));
  const setLessInput = (value: string) =>
    setDraft((d) => ({ ...d, less: value }));

  const hasHours = row.hoursExtra > 0 || row.hoursReduced > 0;
  // Hours only mean anything on a present day: an absence has none.
  const canEditHours = row.mark === "present";

  const commitHours = () => {
    const hoursExtra = parseHours(extraInput);
    const hoursReduced = parseHours(lessInput);
    if (hoursExtra === row.hoursExtra && hoursReduced === row.hoursReduced) {
      return;
    }
    onHoursChange({ hoursExtra, hoursReduced });
  };

  const accent = ACCENT_BY_MARK[row.mark ?? "none"];

  return (
    <li
      className={cn(
        // `sm:flex-wrap` lets the hours panel drop to its own full-width line
        // instead of squeezing the name and the buttons.
        "flex flex-col gap-3 border-l-4 px-3 py-3 transition-colors sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:px-4",
        accent,
        row.mark === null ? "bg-surface-2" : "bg-card",
        disabled && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span
          aria-hidden
          className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/employee?id=${encodeURIComponent(row.employeeId)}`}
            aria-label={t("employeesViewAria", { name: row.name })}
            className="block truncate rounded-sm font-heading text-base font-semibold leading-tight text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {row.mark === null ? (
              <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 font-medium">
                {t("rostNotWritten")}
              </span>
            ) : null}
            {row.shiftName ? <span className="truncate">{row.shiftName}</span> : null}
            {hasHours && canEditHours ? (
              <span className="inline-flex items-center gap-1 text-foreground">
                <Clock3 className="size-3 shrink-0" aria-hidden />
                {row.hoursExtra > 0 ? `+${row.hoursExtra}h` : null}
                {row.hoursReduced > 0 ? `−${row.hoursReduced}h` : null}
              </span>
            ) : null}
            {pending ? <Spinner className="size-3" aria-hidden /> : null}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:w-auto">
        <div
          role="group"
          aria-label={row.name}
          className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-border bg-surface-3 p-1"
        >
          {MARK_OPTIONS.map((option) => {
            const selected = row.mark === option.mark;
            const Icon = option.icon;
            return (
              <button
                key={option.mark}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onMark(option.mark)}
                className={cn(
                  // 44px tall at every width; the label truncates rather than
                  // pushing the row wider than the screen.
                  "flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-1.5 text-[13px] font-semibold transition-colors sm:min-w-[104px] sm:px-2 sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  "disabled:pointer-events-none",
                  selected
                    ? option.selectedClass
                    : "bg-surface-1 text-muted-foreground hover:bg-surface-4 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{t(option.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary by construction: it only appears once somebody is present,
            and it never stands between the operator and the common answer. */}
        {canEditHours && !disabled ? (
          <button
            type="button"
            onClick={() => setHoursOpen((open) => !open)}
            aria-expanded={hoursOpen}
            aria-controls={`hours-${row.employeeId}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-start rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MinusCircle className="size-3.5 shrink-0" aria-hidden />
            {t("rostHoursToggle")}
          </button>
        ) : null}
      </div>

      {canEditHours && hoursOpen && !disabled ? (
        <div
          id={`hours-${row.employeeId}`}
          className="min-w-0 rounded-xl border border-border bg-surface-2 p-3 sm:order-last sm:w-full"
        >
          <p className="text-sm font-medium text-foreground">
            {t("rostHoursTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("rostHoursHint", { hours: row.hoursPerDay })}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[160px]">
              <Label
                htmlFor={`extra-${row.employeeId}`}
                className="text-xs text-muted-foreground"
              >
                {t("rostHoursExtra")}
              </Label>
              <NumberInput
                id={`extra-${row.employeeId}`}
                decimal
                className="min-h-[44px]"
                value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
                onBlur={commitHours}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[160px]">
              <Label
                htmlFor={`less-${row.employeeId}`}
                className="text-xs text-muted-foreground"
              >
                {t("rostHoursLess")}
              </Label>
              <NumberInput
                id={`less-${row.employeeId}`}
                decimal
                className="min-h-[44px]"
                value={lessInput}
                onChange={(e) => setLessInput(e.target.value)}
                onBlur={commitHours}
              />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
