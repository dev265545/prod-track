"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { openDB } from "@/lib/db/adapter";
import { isTauri } from "@/lib/db/adapter";
import {
  importDatabase,
  validateExportData,
  type ExportData,
} from "@/lib/db/exportImport";
import { importDatabaseFromSqliteBuffer } from "@/lib/db/sqliteBrowser";
import { importDbFromFile } from "@/lib/db/tauriDb";
import { setAppPassword, startSession } from "@/lib/auth";
import { setFirstRunComplete } from "@/lib/onboarding";
import { Spinner } from "@/components/ui/spinner";

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [wantsImport, setWantsImport] = useState<boolean | null>(null);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  /** Browser: JSON or .db. Tauri: JSON only (SQLite uses native dialog). */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

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

  // Step 1: Welcome
  if (step === 1) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-heading">
            Welcome to ProdTrack
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Track production, advances, and salaries for your team.
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setStep(2)} className="w-full">
            Get started
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 2: Resync choice
  if (step === 2) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-heading">
            Do you have existing data?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Import from a JSON or .db backup, or start fresh.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="default"
            onClick={() => {
              setWantsImport(true);
              setStep(3);
            }}
          >
            Yes, import JSON or .db file
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setWantsImport(false);
              setStep(4);
            }}
          >
            No, start fresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 3: Import (when wantsImport === true)
  if (step === 3) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-heading">
            Import your data
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isTauri()
              ? "Import a JSON backup (same as web export) or a SQLite .db file. Either replaces existing data."
              : "Choose a JSON or .db file. Import will replace any existing data."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="default"
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>Continue</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Step 4: Set password
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-heading">
          Create your password
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Set a password to protect your data. You will need it to log in.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-password">Password</Label>
            <Input
              id="onboarding-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              minLength={4}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-confirm">Confirm password</Label>
            <Input
              id="onboarding-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          {passwordError && (
            <Alert variant="destructive">
              <AlertDescription>{passwordError}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(wantsImport ? 3 : 2)}
            >
              Back
            </Button>
            <Button type="submit" disabled={loading}>
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
    </Card>
  );
}
