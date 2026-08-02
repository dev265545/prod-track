"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Newsreader } from "next/font/google";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  HardDrive,
  KeyRound,
  Sparkles,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { openDB, isSqliteFileMode, isTauri } from "@/lib/db/adapter";
import {
  isFileSystemAccessSupported,
  pickAndCreateNewSqliteFile,
  pickAndOpenExistingSqliteFile,
} from "@/lib/db/sqliteFileAdapter";
import { getStoredMainSqliteHandle } from "@/lib/db/sqliteFileHandleStore";
import {
  importDatabase,
  validateExportData,
  type ExportData,
} from "@/lib/db/exportImport";
import { importDatabaseFromSqliteBuffer } from "@/lib/db/sqliteBrowser";
import { importDbFromFile } from "@/lib/db/tauriDb";
import {
  legacyWorkspaceHasData,
  shouldOpenLoginInsteadOfOnboarding,
} from "@/lib/db/appMetadata";
import {
  MIN_PASSWORD_LENGTH,
  setAppPassword,
  setWorkerPassword,
  startSession,
} from "@/lib/auth";
import { setFirstRunComplete } from "@/lib/onboarding";
import { useLanguage } from "@/components/language-provider";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n/messages";

const welcomeDisplay = Newsreader({
  subsets: ["latin"],
  weight: ["400", "600"],
  adjustFontFallback: false,
});

type Step = "file" | "data" | "password";

/**
 * The storage backend is decided by the build, never by the user: Tauri uses
 * the local SQLite database, the plain web build uses in-browser storage. Only
 * the "sqlite-file" build genuinely needs an answer — the browser cannot open a
 * file without the user picking it — so that is the only extra step.
 */
function buildSteps(): Step[] {
  return isSqliteFileMode()
    ? ["file", "data", "password"]
    : ["data", "password"];
}

const STEP_LABEL: Record<Step, MessageKey> = {
  file: "obStepFile",
  data: "obStepData",
  password: "obStepPassword",
};

function StepProgress({
  steps,
  current,
  label,
}: {
  steps: Step[];
  current: Step;
  label: (step: Step) => string;
}) {
  const index = steps.indexOf(current);
  return (
    <div className="mb-8 w-full">
      <ol className="flex w-full items-stretch gap-2" aria-hidden>
        {steps.map((step, i) => (
          <li key={step} className="flex flex-1 flex-col gap-2">
            <span
              className={cn(
                "block h-2 rounded-full",
                i <= index ? "bg-primary" : "bg-border",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium leading-snug sm:text-sm",
                i === index ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label(step)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A tall, tappable option: icon + heading + one line of plain explanation. */
function ChoiceButton({
  icon,
  title,
  hint,
  variant = "outline",
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  variant?: "default" | "outline";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal px-4 py-4 text-left"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-base font-semibold leading-snug">{title}</span>
        {hint ? (
          <span
            className={cn(
              "text-sm font-normal leading-snug",
              variant === "default"
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </Button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useLanguage();

  const steps = buildSteps();
  const [step, setStep] = useState<Step>(steps[0]);
  const [choosingFile, setChoosingFile] = useState(false);
  const [importError, setImportError] = useState("");
  const [importDone, setImportDone] = useState(false);
  const [fileError, setFileError] = useState("");
  const [existingDbName, setExistingDbName] = useState<string | null>(null);
  const [dailyPassword, setDailyPassword] = useState("");
  const [dailyConfirm, setDailyConfirm] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerConfirm, setOwnerConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasExistingData, setHasExistingData] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImport = useRef<(() => void | Promise<void>) | null>(null);

  useEffect(() => {
    if (!isSqliteFileMode()) return;
    void getStoredMainSqliteHandle().then((s) => {
      setExistingDbName(s ? s.info.displayName || s.handle.name || null : null);
    });
  }, []);

  // Checked up front so the confirm-before-overwrite decision is instant.
  useEffect(() => {
    if (!choosingFile) return;
    let cancelled = false;
    void (async () => {
      try {
        await openDB();
        const has = await legacyWorkspaceHasData();
        if (!cancelled) setHasExistingData(has);
      } catch {
        // Database not readable yet — there is nothing to overwrite.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [choosingFile]);

  const goToLoginIfExistingWorkspace = async (): Promise<boolean> => {
    if (await shouldOpenLoginInsteadOfOnboarding()) {
      setFirstRunComplete();
      router.replace("/login?welcome=1");
      return true;
    }
    return false;
  };

  /** Run a database-file action, showing a plain error instead of a raw one. */
  const runFileAction = async (action: () => Promise<void>) => {
    setFileError("");
    setLoading(true);
    try {
      await action();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The user closing the file picker is not an error worth showing.
      if (!msg.toLowerCase().includes("abort")) setFileError(t("obFileFailed"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Importing replaces every business record, so ask first whenever this
   * workspace already holds data. `hasExistingData` is read before the user
   * clicks so opening the file picker stays inside the click's user gesture.
   */
  const guardImport = (action: () => void | Promise<void>) => {
    setImportError("");
    setImportDone(false);
    if (hasExistingData) {
      pendingImport.current = action;
      setConfirmOpen(true);
      return;
    }
    void action();
  };

  const importFromNativeDbFile = async () => {
    setLoading(true);
    try {
      await openDB();
      const result = await importDbFromFile();
      if (result.success) setImportDone(true);
      else if (!result.error?.includes("cancelled"))
        setImportError(t("obImportFailed"));
    } catch {
      setImportError(t("obImportFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setImportError("");
    setImportDone(false);
    if (!file) return;

    setLoading(true);
    try {
      await openDB();
      const name = file.name.toLowerCase();
      const isDb =
        name.endsWith(".db") ||
        name.endsWith(".sqlite") ||
        name.endsWith(".sqlite3");

      if (isDb) {
        const buf = await file.arrayBuffer();
        const data = await importDatabaseFromSqliteBuffer(buf);
        await importDatabase(data);
      } else {
        const raw = await file.text();
        const data = JSON.parse(raw) as unknown;
        const { valid } = validateExportData(data);
        if (!valid) {
          setImportError(t("obImportInvalid"));
          return;
        }
        await importDatabase(data as ExportData);
      }
      setImportDone(true);
    } catch {
      setImportError(t("obImportFailed"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Both credentials are created together: an install with only an admin
   * password forces the daily user to log in as admin, which defeats the whole
   * point of keeping salary and settings private.
   */
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setDailyError("");
    setOwnerError("");
    setPasswordError("");
    const daily = dailyPassword.trim();
    const dailyC = dailyConfirm.trim();
    const owner = ownerPassword.trim();
    const ownerC = ownerConfirm.trim();

    if (daily.length < MIN_PASSWORD_LENGTH) {
      setDailyError(t("obPassTooShort"));
      return;
    }
    if (daily !== dailyC) {
      setDailyError(t("obPassMismatch"));
      return;
    }
    if (owner.length < MIN_PASSWORD_LENGTH) {
      setOwnerError(t("obPassTooShort"));
      return;
    }
    if (owner !== ownerC) {
      setOwnerError(t("obPassMismatch"));
      return;
    }
    if (daily === owner) {
      setPasswordError(t("twoPwSameAsOwner"));
      return;
    }

    setLoading(true);
    try {
      // Worker first: setAppPassword rotates the session nonce last, so the
      // session started below is the one that stays valid.
      await setWorkerPassword(daily);
      await setAppPassword(owner);
      setFirstRunComplete();
      startSession("admin");
      router.replace("/");
    } catch {
      setPasswordError(t("obPassSaveFailed"));
      setLoading(false);
    }
  };

  const stepNumber = steps.indexOf(step) + 1;

  return (
    <div className="flex w-full flex-col">
      <header className="mb-6 sm:mb-8">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("obChooseLanguage")}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={locale === "en" ? "default" : "outline"}
              onClick={() => setLocale("en")}
              className="h-11 min-w-24 px-4 text-base"
              aria-pressed={locale === "en"}
            >
              {t("languageUseEnglish")}
            </Button>
            <Button
              type="button"
              variant={locale === "hi" ? "default" : "outline"}
              onClick={() => setLocale("hi")}
              className="h-11 min-w-24 px-4 text-base"
              aria-pressed={locale === "hi"}
            >
              {t("languageUseHindi")}
            </Button>
          </div>
        </div>
        <p
          className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-primary"
          translate="no"
        >
          {t("appName")}
        </p>
        <h1
          className={cn(
            welcomeDisplay.className,
            "mt-3 text-[clamp(1.75rem,4.5vw,2.5rem)] font-semibold leading-[1.15] tracking-tight text-foreground",
          )}
        >
          {t("obTitle")}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t("obSubtitle")}
        </p>
      </header>

      <p className="mb-2 text-sm font-medium text-muted-foreground">
        {t("obStepOf", { current: stepNumber, total: steps.length })}
      </p>
      <StepProgress
        steps={steps}
        current={step}
        label={(s) => t(STEP_LABEL[s])}
      />

      <Card
        key={step + String(choosingFile)}
        className="animate-onboarding-panel border-border/80 shadow-md"
      >
        {step === "file" ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pb-6 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                {t("obFileTitle")}
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("obFileDesc")}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-8 sm:pb-10">
              {!isFileSystemAccessSupported() ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{t("obFileUnsupported")}</AlertDescription>
                </Alert>
              ) : null}
              {fileError ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{fileError}</AlertDescription>
                </Alert>
              ) : null}
              {loading ? (
                <p className="flex items-center gap-2 text-base text-muted-foreground">
                  <Spinner />
                  {t("obWorking")}
                </p>
              ) : null}
              {existingDbName ? (
                <ChoiceButton
                  icon={<HardDrive className="size-5" />}
                  variant="default"
                  title={t("obFileLinked", { name: existingDbName })}
                  hint={t("obFileLinkedHint")}
                  disabled={loading}
                  onClick={() =>
                    void runFileAction(async () => {
                      await openDB();
                      if (await goToLoginIfExistingWorkspace()) return;
                      setStep("data");
                    })
                  }
                />
              ) : null}
              <ChoiceButton
                icon={<FilePlus2 className="size-5" />}
                variant={existingDbName ? "outline" : "default"}
                title={t("obFileNew")}
                hint={t("obFileNewHint")}
                disabled={loading || !isFileSystemAccessSupported()}
                onClick={() =>
                  void runFileAction(async () => {
                    await pickAndCreateNewSqliteFile();
                    await openDB();
                    setStep("data");
                  })
                }
              />
              <ChoiceButton
                icon={<FolderOpen className="size-5" />}
                title={t("obFileExisting")}
                hint={t("obFileExistingHint")}
                disabled={loading || !isFileSystemAccessSupported()}
                onClick={() =>
                  void runFileAction(async () => {
                    await pickAndOpenExistingSqliteFile();
                    await openDB();
                    if (await goToLoginIfExistingWorkspace()) return;
                    setStep("data");
                  })
                }
              />
            </CardContent>
          </>
        ) : null}

        {step === "data" && !choosingFile ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                {t("obDataTitle")}
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("obDataDesc")}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-8 sm:pb-10">
              <ChoiceButton
                icon={<Upload className="size-5" />}
                variant="default"
                title={t("obDataImport")}
                hint={t("obDataImportHint")}
                onClick={() => {
                  setImportError("");
                  setImportDone(false);
                  setChoosingFile(true);
                }}
              />
              <ChoiceButton
                icon={<Sparkles className="size-5" />}
                title={t("obDataSkip")}
                hint={t("obDataSkipHint")}
                onClick={() => setStep("password")}
              />
              {steps[0] === "file" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 self-start px-3 text-base"
                  onClick={() => setStep("file")}
                >
                  <ArrowLeft className="size-4" />
                  {t("obBack")}
                </Button>
              ) : null}
            </CardContent>
          </>
        ) : null}

        {step === "data" && choosingFile ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                {t("obImportTitle")}
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("obImportDesc")}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-8 sm:pb-10">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.db,.sqlite,.sqlite3,application/json,application/x-sqlite3"
                className="sr-only"
                onChange={handleImportFile}
              />
              <ChoiceButton
                icon={<Upload className="size-5" />}
                variant="default"
                title={t("obImportChooseJson")}
                disabled={loading}
                onClick={() =>
                  guardImport(() => fileInputRef.current?.click())
                }
              />
              {isTauri() ? (
                <ChoiceButton
                  icon={<HardDrive className="size-5" />}
                  title={t("obImportChooseDb")}
                  disabled={loading}
                  onClick={() => guardImport(importFromNativeDbFile)}
                />
              ) : null}
              {loading ? (
                <p className="flex items-center gap-2 text-base text-muted-foreground">
                  <Spinner />
                  {t("obImportRunning")}
                </p>
              ) : null}
              {importError ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              ) : null}
              {importDone ? (
                <Alert>
                  <Check />
                  <AlertDescription>{t("obImportDone")}</AlertDescription>
                </Alert>
              ) : null}
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full text-base sm:w-auto sm:px-6"
                  disabled={loading}
                  onClick={() => setChoosingFile(false)}
                >
                  <ArrowLeft className="size-4" />
                  {t("obBack")}
                </Button>
                <Button
                  type="button"
                  className="h-12 w-full text-base sm:w-auto sm:px-6"
                  disabled={loading}
                  onClick={() => setStep("password")}
                >
                  {t("obContinue")}
                </Button>
              </div>
            </CardContent>
          </>
        ) : null}

        {step === "password" ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                {t("twoPwObTitle")}
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("twoPwObDesc")}
              </p>
            </CardHeader>
            <CardContent className="pb-8 sm:pb-10">
              <form onSubmit={handleSetPassword} className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="onboarding-daily" className="text-base">
                      {t("twoPwObDailyLabel")}
                    </Label>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t("twoPwObDailyHint")}
                    </p>
                    <Input
                      id="onboarding-daily"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={dailyPassword}
                      onChange={(e) => setDailyPassword(e.target.value)}
                      placeholder={t("twoPwObDailyPlaceholder")}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="onboarding-daily-confirm"
                      className="text-base"
                    >
                      {t("twoPwObDailyConfirmLabel")}
                    </Label>
                    <Input
                      id="onboarding-daily-confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={dailyConfirm}
                      onChange={(e) => setDailyConfirm(e.target.value)}
                      placeholder={t("obPassConfirmPlaceholder")}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  {dailyError ? (
                    <p className="text-base font-medium text-destructive">
                      {dailyError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="onboarding-owner" className="text-base">
                      {t("twoPwObOwnerLabel")}
                    </Label>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t("twoPwObOwnerHint")}
                    </p>
                    <Input
                      id="onboarding-owner"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder={t("twoPwObOwnerPlaceholder")}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="onboarding-owner-confirm"
                      className="text-base"
                    >
                      {t("twoPwObOwnerConfirmLabel")}
                    </Label>
                    <Input
                      id="onboarding-owner-confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={ownerConfirm}
                      onChange={(e) => setOwnerConfirm(e.target.value)}
                      placeholder={t("obPassConfirmPlaceholder")}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  {ownerError ? (
                    <p className="text-base font-medium text-destructive">
                      {ownerError}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 self-start px-3 text-base"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  {showPassword ? t("obPassHide") : t("obPassShow")}
                </Button>

                <Alert>
                  <KeyRound />
                  <AlertTitle className="text-base">
                    {t("obPassWarnTitle")}
                  </AlertTitle>
                  <AlertDescription className="text-base leading-relaxed">
                    {t("obPassWarnBody")}
                  </AlertDescription>
                </Alert>

                {passwordError ? (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertDescription className="text-base">
                      {passwordError}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full text-base sm:w-auto sm:px-6"
                    disabled={loading}
                    onClick={() => setStep("data")}
                  >
                    <ArrowLeft className="size-4" />
                    {t("obBack")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full text-base sm:w-auto sm:px-6"
                  >
                    {loading ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        {t("obFinishing")}
                      </>
                    ) : (
                      t("obFinish")
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        ) : null}
      </Card>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) pendingImport.current = null;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("obConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              {t("obConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-base">
              {t("obConfirmNo")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-12 text-base"
              onClick={() => {
                const action = pendingImport.current;
                pendingImport.current = null;
                setConfirmOpen(false);
                void action?.();
              }}
            >
              {t("obConfirmYes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
