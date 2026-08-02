"use client";

import * as React from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Eraser } from "lucide-react";
import { countByIndex, STORES } from "@/lib/db/adapter";
import { deleteProductionsBefore } from "@/lib/services/productionService";
import { deleteAdvancesBefore } from "@/lib/services/advanceService";
import { useLanguage } from "@/components/language-provider";
import { recordPurge } from "@/lib/services/purgeAudit";
import { cn } from "@/lib/utils";
import { SettingsSection, ToneAlert, type ToneMessage } from "./shared";

type Counts = { date: string; work: number; advances: number };

const MIN_DATE_KEY = "";
const MAX_DATE_KEY = "￿";

/**
 * How many rows in `store` are dated before `cutoff`, asked of the `by_date`
 * index instead of by reading every row and filtering in JavaScript.
 *
 * Counted as "everything" minus "everything on or after the cutoff": index
 * ranges are inclusive at both ends, so that is the only exact way to express
 * the strict `date < cutoff` the delete itself uses. Both halves walk keys
 * without deserialising a single record.
 */
async function countOlderThan(store: string, cutoff: string): Promise<number> {
  const [total, kept] = await Promise.all([
    countByIndex(store, "by_date", MIN_DATE_KEY, MAX_DATE_KEY),
    countByIndex(store, "by_date", cutoff, MAX_DATE_KEY),
  ]);
  return total - kept;
}

function Checkbox({
  id,
  checked,
  onChange,
  label,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card px-4 text-base text-foreground",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}

/**
 * Counting first, then deleting. The old version deleted work entries and
 * advances together, sight unseen — the owner could not tell whether he was
 * about to lose ten rows or ten thousand.
 */
export function CleanupCard() {
  const { t } = useLanguage();
  const [beforeDate, setBeforeDate] = React.useState("");
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [pickWork, setPickWork] = React.useState(true);
  const [pickAdvances, setPickAdvances] = React.useState(true);
  const [message, setMessage] = React.useState<ToneMessage>(null);

  const stale = counts !== null && counts.date !== beforeDate;
  const fresh = counts && !stale ? counts : null;
  const nothingFound =
    fresh !== null && fresh.work === 0 && fresh.advances === 0;

  const selectedWork = fresh && pickWork ? fresh.work : 0;
  const selectedAdvances = fresh && pickAdvances ? fresh.advances : 0;
  const nothingPicked = selectedWork === 0 && selectedAdvances === 0;

  const summary = React.useMemo(() => {
    const parts: string[] = [];
    if (selectedWork > 0)
      parts.push(t("setgCleanupSummaryWork", { count: selectedWork }));
    if (selectedAdvances > 0)
      parts.push(t("setgCleanupSummaryAdvances", { count: selectedAdvances }));
    if (parts.length === 2)
      return t("setgCleanupSummaryAnd", { a: parts[0], b: parts[1] });
    return parts[0] ?? "";
  }, [selectedWork, selectedAdvances, t]);

  const check = async () => {
    if (!beforeDate) return;
    setChecking(true);
    setMessage(null);
    try {
      const [work, advances] = await Promise.all([
        countOlderThan(STORES.PRODUCTIONS, beforeDate),
        countOlderThan(STORES.ADVANCES, beforeDate),
      ]);
      setCounts({ date: beforeDate, work, advances });
    } catch (e) {
      setMessage({
        tone: "danger",
        text: t("setgCleanupFailed", { msg: (e as Error).message }),
      });
    } finally {
      setChecking(false);
    }
  };

  const remove = async () => {
    if (!fresh) return;
    const removed = summary;
    try {
      // The two service calls below are deliberately unaudited: only this
      // component knows the cutoff the owner picked, which boxes were ticked
      // and the counts he was shown before confirming. One entry, here, with
      // all three — rather than two entries that each know half the story.
      const work = pickWork ? await deleteProductionsBefore(fresh.date) : 0;
      const advances = pickAdvances
        ? await deleteAdvancesBefore(fresh.date)
        : 0;
      recordPurge(t("auditWirePurge", { work, advances, date: fresh.date }), {
        cutoff: fresh.date,
        workEntriesRemoved: work,
        advancesRemoved: advances,
        workEntriesChosen: pickWork,
        advancesChosen: pickAdvances,
      });
      setCounts(null);
      setMessage({
        tone: "success",
        text: t("setgCleanupDone", { summary: removed }),
      });
    } catch (e) {
      setMessage({
        tone: "danger",
        text: t("setgCleanupFailed", { msg: (e as Error).message }),
      });
    }
  };

  return (
    <SettingsSection
      icon={Eraser}
      title={t("setgCleanupTitle")}
      description={t("setgCleanupBody")}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="cleanup-date" className="text-base">
            {t("setgCleanupDateLabel")}
          </Label>
          <DatePicker
            id="cleanup-date"
            value={beforeDate}
            onChange={setBeforeDate}
            placeholder={t("settingsHolidayDatePlaceholder")}
            className="min-h-[44px] w-full min-w-[11rem] sm:w-48"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!beforeDate || checking}
          onClick={() => void check()}
          className="min-h-[44px] px-6 text-base"
        >
          {checking ? t("setgCleanupChecking") : t("setgCleanupCheck")}
        </Button>
      </div>

      {nothingFound && (
        <ToneAlert
          message={{
            tone: "info",
            text: t("setgCleanupNothing", { date: fresh.date }),
          }}
        />
      )}

      {fresh && !nothingFound && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-base font-medium text-foreground">
            {t("setgCleanupFoundTitle", { date: fresh.date })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Checkbox
              id="cleanup-work"
              checked={pickWork && fresh.work > 0}
              disabled={fresh.work === 0}
              onChange={setPickWork}
              label={t("setgCleanupPickWork", { count: fresh.work })}
            />
            <Checkbox
              id="cleanup-advances"
              checked={pickAdvances && fresh.advances > 0}
              disabled={fresh.advances === 0}
              onChange={setPickAdvances}
              label={t("setgCleanupPickAdvances", { count: fresh.advances })}
            />
          </div>
          {nothingPicked ? (
            <p className="text-sm text-muted-foreground">
              {t("setgCleanupPickNone")}
            </p>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-[44px] w-fit px-6 text-base"
                >
                  {t("setgCleanupButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("setgCleanupConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("setgCleanupConfirmDesc", { summary })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-[44px]">
                    {t("commonCancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void remove()}
                  >
                    {t("commonDelete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      <ToneAlert message={message} />
    </SettingsSection>
  );
}
