"use client";

import * as React from "react";
import {
  AlarmClock,
  CheckCircle2,
  FolderOpen,
  HardDriveDownload,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { SettingsSection, ToneAlert, type ToneMessage } from "./shared";
import {
  chooseAutoBackupFolder,
  getBackupStatus,
  inspectBackupFile,
  pickBackupFileToVerify,
  recordBackupVerified,
  runAutoBackup,
  saveCopyNow,
  setAutoBackupEnabled,
  setAutoBackupKeepCount,
  setBackupReminderDays,
  snoozeBackupReminder,
  supportsAutomaticBackups,
  verifyBackupFile,
  type BackupStatus,
} from "@/lib/services/backupService";

/**
 * Everything about keeping a second copy of the factory's data.
 *
 * Three separate exports because they belong in three different places: the
 * one-line status wherever the owner already is, the reminder on the home
 * screen, and the full controls in Settings. All three read the same stored
 * timestamp, so they can never disagree.
 *
 * The reminder is a strip of page, not a dialog. Someone marking hazri at 8am
 * must be able to ignore it completely; a modal on launch would be dismissed
 * unread within a week and then the app is silent again.
 */

/** Plain sentence for how old the newest copy is. */
function useFreshnessLine(status: BackupStatus | null): string | null {
  const { t } = useLanguage();
  if (!status) return null;
  switch (status.state) {
    case "never":
      return t("bkpLastSavedNever");
    case "clockSkew":
      return t("bkpClockWrong");
    case "fresh":
    case "due": {
      const days = status.daysSince ?? 0;
      if (days === 0) return t("bkpLastSavedToday");
      if (days === 1) return t("bkpLastSavedYesterday");
      return t("bkpLastSavedDays", { days });
    }
  }
}

function useBackupStatus(): {
  status: BackupStatus | null;
  reload: () => Promise<void>;
} {
  const [status, setStatus] = React.useState<BackupStatus | null>(null);
  const reload = React.useCallback(async () => {
    try {
      setStatus(await getBackupStatus());
    } catch (error) {
      console.error("[backup] could not read backup status", error);
    }
  }, []);
  React.useEffect(() => {
    let alive = true;
    getBackupStatus()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch((error) => {
        console.error("[backup] could not read backup status", error);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { status, reload };
}

/**
 * The nudge. Renders nothing at all while a recent copy exists, so a factory
 * that backs up weekly never sees it.
 *
 * On the desktop build, if the owner has switched automatic copies on, this is
 * also where one gets written: the app is open, the folder is known, and no
 * dialog is needed. The strip only appears when that could not happen.
 */
export function BackupReminderBanner() {
  const { t } = useLanguage();
  const { status, reload } = useBackupStatus();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<ToneMessage>(null);
  const [hidden, setHidden] = React.useState(false);
  const autoTried = React.useRef(false);

  React.useEffect(() => {
    if (!status || autoTried.current) return;
    if (!status.shouldRemind) return;
    if (!status.automaticSupported) return;
    if (!status.autoBackupEnabled || !status.autoBackupFolder) return;
    autoTried.current = true;
    void runAutoBackup().then((result) => {
      if (result.ok) void reload();
    });
  }, [status, reload]);

  const line = useFreshnessLine(status);
  if (!status || !status.shouldRemind || hidden) return null;

  const save = async () => {
    setBusy(true);
    const result = await saveCopyNow();
    setBusy(false);
    if (result.ok) {
      setMessage({ tone: "success", text: t("bkpSaved") });
      await reload();
    } else {
      setMessage({ tone: "danger", text: t("bkpSaveFailed", { msg: result.error }) });
    }
  };

  const later = async () => {
    setHidden(true);
    await snoozeBackupReminder(1);
  };

  return (
    <section
      aria-label={t("bkpDueTitle")}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-destructive bg-surface-2 p-4 sm:p-5"
    >
      <h2 className="flex min-w-0 items-center gap-3 font-heading text-lg font-semibold text-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-destructive">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">{t("bkpDueTitle")}</span>
      </h2>
      {line && <p className="text-base text-foreground">{line}</p>}
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        {t("bkpDueBody")}
      </p>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-[44px] px-5 text-base"
        >
          <HardDriveDownload data-icon="inline-start" className="size-5" aria-hidden />
          {busy ? t("bkpSaving") : t("bkpSaveNow")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void later()}
          className="min-h-[44px] px-5 text-base"
        >
          <AlarmClock data-icon="inline-start" className="size-5" aria-hidden />
          {t("bkpLater")}
        </Button>
      </div>
      <ToneAlert message={message} />
    </section>
  );
}

/** Quiet one-liner: how old the newest copy is, wherever there is room. */
export function BackupFreshnessLine({ className }: { className?: string }) {
  const { status } = useBackupStatus();
  const line = useFreshnessLine(status);
  if (!line) return null;
  const alarming = status?.state !== "fresh";
  return (
    <p
      aria-live="polite"
      className={[
        "flex min-w-0 items-start gap-2 text-base",
        alarming ? "text-foreground" : "text-muted-foreground",
        className ?? "",
      ].join(" ")}
    >
      {alarming ? (
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      )}
      <span className="min-w-0">{line}</span>
    </p>
  );
}

const REMINDER_CHOICES = [
  { days: 7, labelKey: "bkpEveryWeek" as const },
  { days: 15, labelKey: "bkpEveryFortnight" as const },
  { days: 30, labelKey: "bkpEveryMonth" as const },
];

const KEEP_CHOICES = [3, 5, 10, 20];

/**
 * The Settings card: how often to remind, where automatic copies go, and a way
 * to check that a copy is actually good.
 *
 * The web build is told plainly that it gets reminders only. Claiming
 * automatic protection a browser cannot deliver would be worse than saying
 * nothing, because the owner would stop making copies by hand.
 */
export function BackupScheduleCard() {
  const { t, locale } = useLanguage();
  const { status, reload } = useBackupStatus();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<ToneMessage>(null);
  const [verifyMessage, setVerifyMessage] = React.useState<ToneMessage>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const desktop = supportsAutomaticBackups();

  const run = async (fn: () => Promise<ToneMessage>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (error) {
      setMessage({
        tone: "danger",
        text: t("bkpAutoFailed", { msg: (error as Error).message }),
      });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const chooseDays = (days: number) =>
    run(async () => {
      await setBackupReminderDays(days);
      return { tone: "success", text: t("bkpEverySaved") };
    });

  const chooseKeep = (count: number) =>
    run(async () => {
      await setAutoBackupKeepCount(count);
      return { tone: "success", text: t("bkpEverySaved") };
    });

  const chooseFolder = () =>
    run(async () => {
      const folder = await chooseAutoBackupFolder();
      if (!folder) return null;
      return { tone: "success", text: t("bkpFolderNow", { folder }) };
    });

  const toggleAuto = (next: boolean) =>
    run(async () => {
      if (next && !status?.autoBackupFolder) {
        return { tone: "danger", text: t("bkpAutoNoFolder") };
      }
      await setAutoBackupEnabled(next);
      return { tone: "success", text: t("bkpEverySaved") };
    });

  const backupNow = () =>
    run(async () => {
      if (!desktop) {
        const result = await saveCopyNow();
        return result.ok
          ? { tone: "success", text: t("bkpSaved") }
          : { tone: "danger", text: t("bkpSaveFailed", { msg: result.error }) };
      }
      const result = await runAutoBackup();
      if (!result.ok) {
        return {
          tone: "danger",
          text:
            result.error === "no-folder"
              ? t("bkpAutoNoFolder")
              : t("bkpAutoFailed", { msg: result.error }),
        };
      }
      const pruned = result.result.pruned;
      return {
        tone: "success",
        text:
          t("bkpAutoDone", {
            name: result.result.fileName,
            kept: result.result.kept,
          }) +
          (pruned.length > 0
            ? ` ${t("bkpAutoPruned", { names: pruned.join(", ") })}`
            : ""),
      };
    });

  /** Desktop: pick a copy and open it read-only. Never starts a restore. */
  const verifyDesktop = async () => {
    setBusy(true);
    setVerifyMessage(null);
    try {
      const path = await pickBackupFileToVerify();
      if (!path) return;
      const result = await verifyBackupFile(path);
      if (result.ok) {
        await recordBackupVerified();
        setVerifyMessage({
          tone: "success",
          text: t("bkpVerifyGood", { rows: result.rows ?? 0 }),
        });
      } else {
        setVerifyMessage({
          tone: "danger",
          text: t("bkpVerifyBad", { msg: result.error ?? "" }),
        });
      }
    } finally {
      setBusy(false);
      await reload();
    }
  };

  /** Browser: the file input is the only way to read a file the owner picks. */
  const verifyPicked = async (file: File) => {
    setBusy(true);
    setVerifyMessage(null);
    try {
      const result = await inspectBackupFile(file);
      if (result.ok) {
        await recordBackupVerified();
        setVerifyMessage({
          tone: "success",
          text: t("bkpVerifyGood", { rows: result.rowCount ?? 0 }),
        });
      } else {
        setVerifyMessage({
          tone: "danger",
          text: t("bkpVerifyBad", { msg: result.error ?? "" }),
        });
      }
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const verifiedLine = status?.lastBackupVerifiedAt
    ? t("bkpVerifiedOn", {
        date: new Date(status.lastBackupVerifiedAt).toLocaleDateString(
          locale === "hi" ? "hi-IN" : "en-IN",
        ),
      })
    : t("bkpVerifiedNever");

  return (
    <SettingsSection
      icon={AlarmClock}
      title={t("bkpScheduleTitle")}
      description={t("bkpScheduleBody")}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <BackupFreshnessLine />

        {/* How often to nudge. */}
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-base font-medium text-foreground">
            {t("bkpEveryLabel")}
          </p>
          <div
            role="group"
            aria-label={t("bkpEveryLabel")}
            className="flex min-w-0 flex-wrap gap-2"
          >
            {REMINDER_CHOICES.map(({ days, labelKey }) => (
              <Button
                key={days}
                type="button"
                variant={status?.reminderDays === days ? "default" : "outline"}
                aria-pressed={status?.reminderDays === days}
                disabled={busy || !status}
                onClick={() => void chooseDays(days)}
                className="min-h-[44px] flex-1 px-5 text-base sm:flex-none"
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </div>

        {/* Automatic copies — or an honest explanation of why not. */}
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex min-w-0 items-center gap-2 text-base font-medium text-foreground">
            <FolderOpen className="size-5 shrink-0" aria-hidden />
            {t("bkpAutoTitle")}
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {desktop ? t("bkpAutoDesktopBody") : t("bkpAutoWebBody")}
          </p>

          {desktop && (
            <>
              <p className="min-w-0 break-words text-base text-foreground">
                {status?.autoBackupFolder
                  ? t("bkpFolderNow", { folder: status.autoBackupFolder })
                  : t("bkpFolderNone")}
              </p>
              <div className="flex min-w-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void chooseFolder()}
                  className="min-h-[44px] px-5 text-base"
                >
                  <FolderOpen data-icon="inline-start" className="size-5" aria-hidden />
                  {status?.autoBackupFolder
                    ? t("bkpChangeFolder")
                    : t("bkpChooseFolder")}
                </Button>
                <Button
                  type="button"
                  variant={status?.autoBackupEnabled ? "default" : "outline"}
                  aria-pressed={status?.autoBackupEnabled ?? false}
                  disabled={busy}
                  onClick={() => void toggleAuto(!status?.autoBackupEnabled)}
                  className="min-h-[44px] px-5 text-base"
                >
                  <CheckCircle2 data-icon="inline-start" className="size-5" aria-hidden />
                  {t("bkpAutoOnLabel")}
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("bkpAutoOnHelp")}
              </p>

              <p className="mt-2 text-base font-medium text-foreground">
                {t("bkpKeepLabel")}
              </p>
              <div
                role="group"
                aria-label={t("bkpKeepLabel")}
                className="flex min-w-0 flex-wrap gap-2"
              >
                {KEEP_CHOICES.map((count) => (
                  <Button
                    key={count}
                    type="button"
                    variant={
                      status?.autoBackupKeepCount === count
                        ? "default"
                        : "outline"
                    }
                    aria-pressed={status?.autoBackupKeepCount === count}
                    disabled={busy}
                    onClick={() => void chooseKeep(count)}
                    className="min-h-[44px] min-w-[4rem] px-4 text-base"
                  >
                    {count}
                  </Button>
                ))}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("bkpKeepHelp")}
              </p>
            </>
          )}

          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void backupNow()}
              className="min-h-[44px] px-5 text-base"
            >
              <HardDriveDownload data-icon="inline-start" className="size-5" aria-hidden />
              {busy ? t("bkpSaving") : desktop ? t("bkpRunNow") : t("bkpSaveNow")}
            </Button>
          </div>
          <ToneAlert message={message} />
        </div>

        {/* Checking a copy, without touching the live data. */}
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex min-w-0 items-center gap-2 text-base font-medium text-foreground">
            <ShieldCheck className="size-5 shrink-0" aria-hidden />
            {t("bkpVerifyTitle")}
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("bkpVerifyBody")}
          </p>
          <p className="text-base text-muted-foreground">{verifiedLine}</p>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                desktop ? void verifyDesktop() : fileInput.current?.click()
              }
              className="min-h-[44px] px-5 text-base"
            >
              <ShieldCheck data-icon="inline-start" className="size-5" aria-hidden />
              {busy ? t("bkpVerifyChecking") : t("bkpVerifyButton")}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".db,.sqlite,.sqlite3,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void verifyPicked(file);
            }}
          />
          <ToneAlert message={verifyMessage} />
        </div>
      </div>
    </SettingsSection>
  );
}
