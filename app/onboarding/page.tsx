"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Newsreader } from "next/font/google";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { openDB } from "@/lib/db/adapter";
import { isSqliteFileMode, isTauri } from "@/lib/db/adapter";
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
import { setAppPassword, startSession } from "@/lib/auth";
import { setFirstRunComplete } from "@/lib/onboarding";
import { shouldOpenLoginInsteadOfOnboarding } from "@/lib/db/appMetadata";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const welcomeDisplay = Newsreader({
  subsets: ["latin"],
  weight: ["400", "600"],
  adjustFontFallback: false,
});

type Step = 0 | 1 | 2 | 3 | 4;

type StepDef = { id: Step; label: string };

function buildSteps(includeDb: boolean): StepDef[] {
  if (includeDb) {
    return [
      { id: 0, label: "Database" },
      { id: 1, label: "Welcome" },
      { id: 2, label: "Your data" },
      { id: 3, label: "Import" },
      { id: 4, label: "Password" },
    ];
  }
  return [
    { id: 1, label: "Welcome" },
    { id: 2, label: "Your data" },
    { id: 3, label: "Import" },
    { id: 4, label: "Password" },
  ];
}

function stepState(
  entry: StepDef,
  currentStep: Step,
  wantsImport: boolean | null,
  order: Step[],
): "done" | "current" | "upcoming" | "skipped" {
  const curIdx = order.indexOf(currentStep);
  const i = order.indexOf(entry.id);
  if (i === -1) return "upcoming";
  if (entry.id === 3 && currentStep === 4 && wantsImport === false) {
    return "skipped";
  }
  if (i < curIdx) return "done";
  if (i === curIdx) return "current";
  return "upcoming";
}

function OnboardingStepper({
  steps,
  currentStep,
  wantsImport,
}: {
  steps: StepDef[];
  currentStep: Step;
  wantsImport: boolean | null;
}) {
  const order = steps.map((s) => s.id);
  const currentIdx = order.indexOf(currentStep);

  return (
    <nav aria-label="Setup steps" className="mb-10 w-full">
      <ol className="flex items-start justify-between gap-1 overflow-x-auto pb-2 sm:gap-2">
        {steps.map((entry, idx) => {
          const state = stepState(entry, currentStep, wantsImport, order);
          const isLast = idx === steps.length - 1;
          const connectorDone = idx < currentIdx;
          return (
            <li key={entry.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex w-full min-w-[4.25rem] flex-col items-center gap-2 sm:min-w-[5.5rem]">
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full border-2 text-sm font-semibold font-heading transition-[transform,colors,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:size-[3.25rem] sm:text-base",
                    state === "current" &&
                      "scale-[1.02] border-primary bg-primary text-primary-foreground shadow-md",
                    state === "done" &&
                      "border-primary/70 bg-primary/10 text-primary",
                    state === "upcoming" &&
                      "border-border bg-card text-muted-foreground",
                    state === "skipped" &&
                      "border-dashed border-muted-foreground/35 bg-muted/30 text-muted-foreground",
                  )}
                >
                  {state === "skipped" ? "—" : idx + 1}
                </span>
                <span
                  className={cn(
                    "w-full px-0.5 text-center text-[0.65rem] font-medium leading-snug sm:text-xs",
                    state === "current" && "text-foreground",
                    state === "done" && "text-foreground/90",
                    state === "upcoming" && "text-muted-foreground",
                    state === "skipped" &&
                      "text-muted-foreground line-through decoration-muted-foreground/40",
                  )}
                >
                  {entry.label}
                </span>
              </div>
              {!isLast ? (
                <div
                  className={cn(
                    "mx-0.5 mt-[1.375rem] h-0.5 min-w-[0.35rem] flex-1 rounded-full sm:mx-1 sm:min-w-[1rem]",
                    connectorDone ? "bg-primary/45" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(isSqliteFileMode() ? 0 : 1);
  const [wantsImport, setWantsImport] = useState<boolean | null>(null);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbLocationError, setDbLocationError] = useState("");
  const [existingDbName, setExistingDbName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  const goToLoginIfExistingWorkspace = async (): Promise<boolean> => {
    if (await shouldOpenLoginInsteadOfOnboarding()) {
      setFirstRunComplete();
      router.replace("/login?welcome=1");
      return true;
    }
    return false;
  };

  const showDbStep = isSqliteFileMode();
  const steps = buildSteps(showDbStep);

  useEffect(() => {
    if (!isSqliteFileMode()) return;
    void getStoredMainSqliteHandle().then((s) => {
      setExistingDbName(
        s ? s.info.displayName || s.handle.name || null : null,
      );
    });
  }, []);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setImportError("");
    setImportSuccess(false);
    if (!file) return;

    setLoading(true);
    try {
      await openDB();
      const name = file.name.toLowerCase();
      const isDb =
        name.endsWith(".db") ||
        name.endsWith(".sqlite") ||
        name.endsWith(".sqlite3");

      if (isTauri() && isDb) {
        const result = await importDbFromFile();
        if (result.success) {
          setImportSuccess(true);
        } else {
          if (result.error?.includes("cancelled")) return;
          setImportError(result.error || "Import failed.");
        }
      } else if (isDb) {
        const buf = await file.arrayBuffer();
        const data = await importDatabaseFromSqliteBuffer(buf);
        await importDatabase(data);
        setImportSuccess(true);
      } else {
        const raw = await file.text();
        const data = JSON.parse(raw) as unknown;
        const { valid, error } = validateExportData(data);
        if (!valid) {
          setImportError("Invalid file: " + (error || "unknown"));
          return;
        }
        await importDatabase(data as ExportData);
        setImportSuccess(true);
      }
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    const p = password.trim();
    const c = confirmPassword.trim();
    if (p.length < 4) {
      setPasswordError("Password must be at least 4 characters.");
      return;
    }
    if (p !== c) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await setAppPassword(p);
      setFirstRunComplete();
      startSession();
      router.replace("/");
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col">
      <header className="mb-6 text-center sm:mb-8 sm:text-left">
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          ProdTrack Lite
        </p>
        <h1
          className={cn(
            welcomeDisplay.className,
            "mt-3 text-balance text-[clamp(1.75rem,4.5vw,2.75rem)] font-semibold leading-[1.15] tracking-tight text-foreground",
          )}
        >
          Set up your workspace
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:mx-0 sm:text-lg">
          A few quick steps and you&apos;re ready to track production, shifts,
          and payroll—offline first, your data stays yours.
        </p>
      </header>

      <OnboardingStepper
        steps={steps}
        currentStep={step}
        wantsImport={wantsImport}
      />

      <Card
        key={step}
        className="animate-onboarding-panel border-border/80 shadow-md"
      >
        {step === 0 ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pb-6 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                Choose your database file
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                Save or open a ProdTrack database (.db). Put it on a USB stick
                if you move between computers. This app remembers the file—you
                may need to click Allow when the browser asks.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-8 sm:pb-10">
              {!isFileSystemAccessSupported() ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    This version needs Google Chrome or Microsoft Edge on
                    Windows so the app can save and open your database file.
                  </AlertDescription>
                </Alert>
              ) : null}
              {existingDbName ? (
                <p className="text-sm text-muted-foreground">
                  Linked file: <strong className="text-foreground">{existingDbName}</strong>
                </p>
              ) : null}
              {dbLocationError ? (
                <Alert variant="destructive">
                  <AlertDescription>{dbLocationError}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                type="button"
                disabled={loading || !isFileSystemAccessSupported()}
                className="min-h-12 w-full text-base sm:h-12"
                onClick={async () => {
                  setDbLocationError("");
                  setLoading(true);
                  try {
                    await pickAndCreateNewSqliteFile();
                    await openDB();
                    setStep(1);
                  } catch (err) {
                    const msg =
                      err instanceof Error ? err.message : String(err);
                    if (!String(msg).toLowerCase().includes("abort")) {
                      setDbLocationError(msg);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Working…
                  </>
                ) : (
                  "Create new database file…"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || !isFileSystemAccessSupported()}
                className="min-h-12 w-full text-base sm:h-12"
                onClick={async () => {
                  setDbLocationError("");
                  setLoading(true);
                  try {
                    await pickAndOpenExistingSqliteFile();
                    await openDB();
                    if (await goToLoginIfExistingWorkspace()) return;
                    setStep(1);
                  } catch (err) {
                    const msg =
                      err instanceof Error ? err.message : String(err);
                    if (!String(msg).toLowerCase().includes("abort")) {
                      setDbLocationError(msg);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Working…
                  </>
                ) : (
                  "Use existing database file…"
                )}
              </Button>
              {existingDbName ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  className="min-h-12 w-full text-base"
                  onClick={async () => {
                    setDbLocationError("");
                    setLoading(true);
                    try {
                      await openDB();
                      if (await goToLoginIfExistingWorkspace()) return;
                      setStep(1);
                    } catch (err) {
                      setDbLocationError(
                        err instanceof Error ? err.message : String(err),
                      );
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Continue with linked file
                </Button>
              ) : null}
            </CardContent>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <CardHeader className="pb-4 pt-8 text-center sm:pt-10">
              <p className="mb-3 font-heading text-sm font-medium text-primary">
                You&apos;re in the right place
              </p>
              <CardTitle
                className={cn(
                  welcomeDisplay.className,
                  "text-balance text-3xl font-semibold sm:text-4xl",
                )}
              >
                Welcome to ProdTrack
              </CardTitle>
              <p className="mx-auto mt-4 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Track production by item and shift, manage advances, and run
                salary periods—built for factory teams who need clarity without
                the cloud.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pb-8 sm:pb-10">
              {isSqliteFileMode() ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="min-h-12 w-full text-base"
                >
                  Change database file…
                </Button>
              ) : null}
              <Button
                onClick={() => setStep(2)}
                className="min-h-12 w-full text-base"
              >
                Continue setup
              </Button>
            </CardContent>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                Do you have existing data?
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                Import from a JSON or .db backup, or start with an empty
                workspace.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-8 sm:pb-10">
              <Button
                variant="default"
                className="min-h-12 w-full justify-center text-base sm:min-h-12"
                onClick={() => {
                  setWantsImport(true);
                  setStep(3);
                }}
              >
                Yes — import a backup
              </Button>
              <Button
                variant="outline"
                className="min-h-12 w-full justify-center text-base"
                onClick={() => {
                  setWantsImport(false);
                  setStep(4);
                }}
              >
                No — start fresh
              </Button>
            </CardContent>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                Import your data
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {isTauri()
                  ? "Import a JSON backup (same as web export) or a SQLite .db file. Either replaces existing data."
                  : "Choose a JSON or .db file. Import will replace any existing data."}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pb-8 sm:pb-10">
              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={handleImportFile}
              />
              {!isTauri() && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.db,.sqlite,.sqlite3,application/json,application/x-sqlite3"
                  className="sr-only"
                  onChange={handleImportFile}
                />
              )}
              {isTauri() ? (
                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    variant="default"
                    className="min-h-12 w-full text-base"
                    onClick={() => jsonFileInputRef.current?.click()}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        Importing…
                      </>
                    ) : (
                      "Import JSON backup"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 w-full text-base"
                    onClick={async () => {
                      setLoading(true);
                      setImportError("");
                      setImportSuccess(false);
                      try {
                        await openDB();
                        const result = await importDbFromFile();
                        if (result.success) setImportSuccess(true);
                        else if (!result.error?.includes("cancelled"))
                          setImportError(result.error || "Import failed.");
                      } catch (err) {
                        setImportError((err as Error).message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        Importing…
                      </>
                    ) : (
                      "Import SQLite (.db)"
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="min-h-12 w-full text-base"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Importing…
                    </>
                  ) : (
                    "Choose file (JSON or .db)"
                  )}
                </Button>
              )}
              {importError && (
                <Alert variant="destructive">
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}
              {importSuccess && (
                <Alert>
                  <AlertDescription>Import complete.</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  className="min-h-12 w-full sm:w-auto"
                  onClick={() => setStep(2)}
                >
                  Back
                </Button>
                <Button
                  className="min-h-12 w-full sm:w-auto"
                  onClick={() => setStep(4)}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <CardHeader className="pb-4 pt-8 sm:pt-10">
              <CardTitle className="font-heading text-2xl sm:text-3xl">
                Create your password
              </CardTitle>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                Set a password to protect your data. You&apos;ll need it each
                time you sign in.
              </p>
            </CardHeader>
            <CardContent className="pb-8 sm:pb-10">
              <form
                onSubmit={handleSetPassword}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="onboarding-password" className="text-base">
                    Password
                  </Label>
                  <Input
                    id="onboarding-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 4 characters"
                    minLength={4}
                    required
                    className="min-h-12 text-base"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="onboarding-confirm" className="text-base">
                    Confirm password
                  </Label>
                  <Input
                    id="onboarding-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="min-h-12 text-base"
                  />
                </div>
                {passwordError && (
                  <Alert variant="destructive">
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 w-full sm:w-auto"
                    onClick={() => setStep(wantsImport ? 3 : 2)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="min-h-12 w-full sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        Setting up…
                      </>
                    ) : (
                      "Finish setup"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        ) : null}
      </Card>
    </div>
  );
}
