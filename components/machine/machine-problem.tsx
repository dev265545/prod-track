"use client";

import { TriangleAlert } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MachineProblem } from "@/lib/services/machineService";

/**
 * One shared way of saying "this machine cannot run", so the machine list, the
 * top-up answer and the target plan all name the same problem in the same
 * words. A machine record with a zero or missing pieces-per-shot used to show
 * a run time of "0s", which an operator reads as the fastest machine on the
 * floor; nothing here is ever allowed to render a number for such a machine.
 */
export function machineProblemMessageKey(
  problems: MachineProblem[],
): MessageKey | null {
  if (problems.length === 0) return null;
  const cavities = problems.includes("cavities");
  const cycleTime = problems.includes("cycleTime");
  if (cavities && cycleTime) return "machChkBoth";
  return cavities ? "machChkCavities" : "machChkCycleTime";
}

/**
 * The full-width plain-language notice. Icon *and* word, and a sentence that
 * says where to go and what to do, because a machine has no edit form — it is
 * deleted and re-added.
 */
export function MachineProblemNotice({
  headline,
  problem,
  hint,
}: {
  headline: string;
  problem: string;
  hint: string;
}) {
  return (
    <div
      role="status"
      className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-surface-3 p-4"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-heading text-base font-semibold text-foreground">
          {headline}
        </span>
        <span className="text-sm leading-snug text-foreground">{problem}</span>
        <span className="text-sm leading-snug text-muted-foreground">
          {hint}
        </span>
      </div>
    </div>
  );
}

/** The compact in-table form of the same message: icon and word, never a number. */
export function MachineProblemChip({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-surface-3 px-2.5 py-1 text-sm font-medium text-warning">
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
