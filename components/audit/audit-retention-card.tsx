"use client";

import * as React from "react";
import { Eraser, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/components/language-provider";
import { dateDisplay } from "@/lib/utils/formatter";
import {
  pruneAuditEntriesBefore,
  readAuditLogHealth,
  readCountEntriesBefore,
  type AuditLogHealth,
} from "@/lib/services/auditService";

/** `yyyy-mm-dd` -> the instant that day begins, which is the prune cutoff. */
function cutoffFor(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/**
 * Retention, done out loud.
 *
 * Nothing here runs on a timer and there is no rolling cap that quietly drops
 * the tail: a factory that discovers last March is gone because a constant in
 * the source said 20,000 has lost the only thing this feature was for. So the
 * owner picks a date, is shown the exact count first, confirms, and the
 * removal is itself written into the log.
 *
 * Both numbers on this card — how big the log is, and how much a cutoff would
 * remove — are index key walks now, so the card costs the same on a log of two
 * hundred entries and on one of two hundred thousand. Neither reads a row.
 */
export function AuditRetentionCard({ onPruned }: { onPruned: () => void }) {
  const { t } = useLanguage();
  const [day, setDay] = React.useState("");
  /** The day the shown count belongs to, so a changed date invalidates it. */
  const [countedFor, setCountedFor] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(0);
  const [confirming, setConfirming] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  /** Bumped after a prune so the header re-reads its own deletion. */
  const [reloadHealth, setReloadHealth] = React.useState(0);

  const [health, setHealth] = React.useState<AuditLogHealth | null>(null);
  const fresh = countedFor !== null && countedFor === day;

  // Re-read after a prune: `reloadKey` in the page bumps `onPruned`'s caller,
  // but the card's own header has to follow its own deletion.
  React.useEffect(() => {
    let cancelled = false;
    void readAuditLogHealth()
      .then((next) => {
        if (cancelled) return;
        setHealth(next);
      })
      .catch(() => {
        if (cancelled) return;
        setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadHealth]);

  const check = async () => {
    if (!day) return;
    const target = day;
    try {
      const found = await readCountEntriesBefore(cutoffFor(target));
      // The date may have moved while the count was in flight; `countedFor`
      // is what makes a stale answer invisible rather than wrong.
      setCount(found);
      setCountedFor(target);
    } catch (error) {
      console.error("[audit] retention count failed", error);
      toast.error(t("auditRetentionFailed"));
    }
  };

  const prune = async () => {
    setWorking(true);
    try {
      const removed = await pruneAuditEntriesBefore(cutoffFor(day));
      setCountedFor(null);
      setDay("");
      setReloadHealth((k) => k + 1);
      toast.success(t("auditRetentionDone", { count: removed }));
      onPruned();
    } catch (error) {
      console.error("[audit] prune failed", error);
      toast.error(t("auditRetentionFailed"));
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-lg font-semibold text-foreground">
        {t("auditRetentionTitle")}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("auditRetentionBody")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("auditRetentionCount", { count: health?.count ?? 0 })}
        {health?.oldest
          ? ` ${t("auditRetentionOldest", { date: dateDisplay(health.oldest.slice(0, 10)) })}`
          : ""}
      </p>

      {health?.overCap ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          {t("auditRetentionHeavy")}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="audit-cutoff">{t("auditRetentionCutoff")}</Label>
          <DatePicker
            id="audit-cutoff"
            value={day}
            onChange={(v) => {
              setDay(v);
              setCountedFor(null);
            }}
            className="h-11"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void check()}
          disabled={!day}
          className="h-11 w-full sm:w-fit"
        >
          {t("auditRetentionCheck")}
        </Button>
      </div>

      {fresh ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            {count > 0
              ? t("auditRetentionWillDelete", { count })
              : t("auditRetentionNone")}
          </p>
          {count > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirming(true)}
              disabled={working}
              className="h-11 w-full gap-2 sm:w-fit"
            >
              <Eraser className="size-5 shrink-0" aria-hidden />
              {t("auditRetentionDelete")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("auditRetentionConfirmTitle", { count })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("auditRetentionConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">
              {t("auditRetentionCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={(e) => {
                e.preventDefault();
                void prune();
              }}
            >
              {t("auditRetentionDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
