"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DatePicker } from "@/components/ui/date-picker";
import { Trash2, Download, ShieldAlert, Calendar } from "lucide-react";
import { openDB } from "@/lib/db/adapter";
import {
  isLoggedIn,
  checkExpiry,
  verifyMasterPassword,
  setAppPassword,
} from "@/lib/auth";
import {
  getAllHolidays,
  saveHoliday,
  deleteHoliday,
} from "@/lib/services/factoryHolidayService";
import { deleteProductionsBefore } from "@/lib/services/productionService";
import { deleteAdvancesBefore } from "@/lib/services/advanceService";
import { isTauri } from "@/lib/db/adapter";
import {
  exportDatabase,
  importDatabase,
  validateExportData,
  fetchAutoImportData,
  clearAllData,
  AUTO_IMPORT_PATH,
} from "@/lib/db/exportImport";
import {
  exportDatabaseToSqlite,
  importDatabaseFromSqliteBuffer,
} from "@/lib/db/sqliteBrowser";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { AppLoadingScreen } from "@/components/app-loading-screen";

export default function SettingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [factoryHolidays, setFactoryHolidays] = useState<
    Record<string, unknown>[]
  >([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [historyBefore, setHistoryBefore] = useState("");
  const [deleteResult, setDeleteResult] = useState("");
  const [exportResult, setExportResult] = useState("");
  const [securityResult, setSecurityResult] = useState("");
  const [dbPath, setDbPath] = useState<string | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const h = await getAllHolidays();
    setFactoryHolidays(h);
  };

  useEffect(() => {
    openDB()
      .then(async () => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        await load();
        if (isTauri()) {
          const { getDbPath } = await import("@/lib/db/tauriDb");
          getDbPath().then(setDbPath).catch(() => setDbPath(null));
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <AppLoadingScreen
        title="Opening settings…"
        description="Loading your preferences and data tools."
      />
    );
  }

  const headingClass =
    "text-xl font-semibold text-foreground mb-2 font-heading";
  const headingClassFirst =
    "text-xl font-semibold mb-3 text-foreground font-heading";
  const paraClass = "text-base text-muted-foreground mb-5 leading-relaxed";
  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";
  const paraClassMuted = "text-base text-muted-foreground mb-5";

  return (
    <AppShell>
      <main className="flex flex-col gap-10 animate-fade-in">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-foreground font-heading md:text-4xl">
            Settings &amp; data
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
            Packaging item groups and shifts now live under{" "}
            <strong className="font-medium text-foreground">Items</strong> and{" "}
            <strong className="font-medium text-foreground">Shifts</strong> in the
            sidebar.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className={headingClassFirst + " flex items-center gap-2"}>
              <Trash2 className="size-5 text-destructive" />
              Delete historical data
            </CardTitle>
          </CardHeader>
          <CardContent>
          <p className={paraClass}>
            Permanently remove all productions and advances before the selected
            date. This cannot be undone.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="historyBefore">
                Delete data before (exclusive)
              </Label>
              <input
                id="historyBefore"
                type="date"
                value={historyBefore}
                onChange={(e) => setHistoryBefore(e.target.value)}
                className="flex h-11 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  className={btnPrimaryClass}
                  disabled={!historyBefore}
                >
                  Delete historical data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete historical data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Delete all productions and advances before {historyBefore}? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      if (!historyBefore) return;
                      try {
                        const [prodCount, advCount] = await Promise.all([
                          deleteProductionsBefore(historyBefore),
                          deleteAdvancesBefore(historyBefore),
                        ]);
                        setDeleteResult(
                          `Deleted ${prodCount} production(s) and ${advCount} advance(s).`,
                        );
                        toast.success(
                          `Deleted ${prodCount} production(s) and ${advCount} advance(s)`
                        );
                      } catch (e) {
                        setDeleteResult("Error: " + (e as Error).message);
                        toast.error("Failed to delete historical data");
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {deleteResult && (
            <Alert className="mt-4" variant={deleteResult.startsWith("Error") ? "destructive" : "default"}>
              <AlertDescription>{deleteResult}</AlertDescription>
            </Alert>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass + " flex items-center gap-2"}>
              <Download className="size-5 text-primary" />
              Export / Import
            </CardTitle>
          </CardHeader>
          <CardContent>
          {isTauri() && dbPath && (
            <p className="text-sm text-muted-foreground mb-3 font-mono break-all">
              Database file: {dbPath}
            </p>
          )}
          <p className={paraClassMuted}>
            Export downloads a <strong>SQLite (.db)</strong> file so you can
            keep your records; legacy <strong>JSON</strong> is also available.
            Import accepts <strong>JSON</strong> (legacy) or{" "}
            <strong>SQLite (.db)</strong>. Import replaces all current data.
            Auto import loads from{" "}
            <code className="text-sm bg-muted px-1 rounded">
              {AUTO_IMPORT_PATH}
            </code>{" "}
            if that file exists (e.g. in{" "}
            <code className="text-sm bg-muted px-1 rounded">dist/data/</code>
            ).
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              type="button"
              onClick={async () => {
                try {
                  if (isTauri()) {
                    const { exportDbToFile } = await import("@/lib/db/tauriDb");
                    const result = await exportDbToFile();
                    if (result.success)
                      setExportResult("Database (.db) saved.");
                    else setExportResult("Export failed: " + result.error);
                  } else {
                    const bytes = await exportDatabaseToSqlite();
                    const blob = new Blob([new Uint8Array(bytes)], {
                      type: "application/x-sqlite3",
                    });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `prodtrack-${new Date().toISOString().slice(0, 10)}.db`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    setExportResult("Database (.db) downloaded.");
                  }
                } catch (e) {
                  setExportResult("Export failed: " + (e as Error).message);
                }
              }}
              className={btnPrimaryClass}
            >
              Export database (.db)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const data = await exportDatabase();
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `prodtrack-export-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  setExportResult("Export (JSON legacy) downloaded.");
                } catch (e) {
                  setExportResult("Export failed: " + (e as Error).message);
                }
              }}
              className="rounded-xl min-h-[44px] px-6 py-3"
            >
              Export to JSON (legacy)
            </Button>
            <input
              ref={importJsonInputRef}
              type="file"
              accept=".json,.db,.sqlite,.sqlite3,application/json,application/x-sqlite3"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const name = file.name.toLowerCase();
                const isDb =
                  name.endsWith(".db") ||
                  name.endsWith(".sqlite") ||
                  name.endsWith(".sqlite3");
                try {
                  if (isDb) {
                    const buf = await file.arrayBuffer();
                    const data = await importDatabaseFromSqliteBuffer(buf);
                    if (
                      !confirm(
                        "Import will replace all current data. Continue?",
                      )
                    )
                      return;
                    await importDatabase(data);
                    setExportResult("Import (.db) complete.");
                    load();
                    return;
                  }
                  const raw = await file.text();
                  const data = JSON.parse(raw);
                  const { valid, error } = validateExportData(data);
                  if (!valid) {
                    setExportResult("Invalid file: " + (error || "unknown"));
                    return;
                  }
                  if (
                    !confirm(
                      "Import will replace all current data. Continue?",
                    )
                  )
                    return;
                  await importDatabase(
                    data as Awaited<ReturnType<typeof exportDatabase>>,
                  );
                  setExportResult("Import (JSON) complete.");
                  load();
                } catch (err) {
                  setExportResult("Import failed: " + (err as Error).message);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] px-6 py-3"
              onClick={() => importJsonInputRef.current?.click()}
            >
              Import from file (JSON or .db)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const result = await fetchAutoImportData();
                  if (!result.success) {
                    setExportResult(result.error);
                    return;
                  }
                  if (
                    !confirm(
                      `Found data. Import will replace current data. Continue?`,
                    )
                  )
                    return;
                  await importDatabase(result.data);
                  setExportResult("Auto import complete.");
                  load();
                } catch (e) {
                  setExportResult(
                    "Auto import failed: " + (e as Error).message,
                  );
                }
              }}
              className="rounded-xl border-2 border-primary text-primary hover:bg-accent min-h-[44px] px-6 py-3"
            >
              Auto import (JSON)
            </Button>
          </div>
          {exportResult && (
            <Alert className="mt-4" variant={exportResult.startsWith("Export failed") || exportResult.startsWith("Import failed") || exportResult.startsWith("Invalid") ? "destructive" : "default"}>
              <AlertDescription>{exportResult}</AlertDescription>
            </Alert>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass + " flex items-center gap-2"}>
              <ShieldAlert className="size-5 text-primary" />
              Security &amp; master actions
            </CardTitle>
          </CardHeader>
          <CardContent>
          <p className={paraClassMuted}>
            Change the login password (requires master password). Permanently
            delete all data (requires master password and double confirmation).
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const master = prompt("Enter master password");
                if (master === null) return;
                if (!verifyMasterPassword(master)) {
                  setSecurityResult("Incorrect master password.");
                  return;
                }
                const new1 = prompt("Enter new login password");
                if (new1 === null) return;
                const new2 = prompt("Confirm new login password");
                if (new2 === null) return;
                if (new1 !== new2) {
                  setSecurityResult("Passwords do not match.");
                  return;
                }
                await setAppPassword(new1.trim());
                setSecurityResult("Login password updated.");
              }}
              className="rounded-xl min-h-[44px] px-6 py-3"
            >
              Change login password
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl min-h-[44px] px-6 py-3"
                >
                  Master delete all data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Permanently delete ALL data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. You will be asked for the master password and to type DELETE to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      const master = prompt("Enter master password to confirm");
                      if (master === null) return;
                      if (!verifyMasterPassword(master)) {
                        setSecurityResult("Incorrect master password.");
                        toast.error("Incorrect master password");
                        return;
                      }
                      const confirmText = prompt("Type DELETE (all caps) to confirm.");
                      if (confirmText !== "DELETE") {
                        setSecurityResult("Confirmation did not match.");
                        toast.error("Confirmation did not match");
                        return;
                      }
                      try {
                        await clearAllData();
                        setSecurityResult("All data deleted.");
                        toast.success("All data deleted");
                        load();
                      } catch (e) {
                        setSecurityResult("Error: " + (e as Error).message);
                        toast.error("Failed to delete data");
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {securityResult && (
            <Alert className="mt-4" variant={securityResult.startsWith("Incorrect") || securityResult.startsWith("Error") || securityResult.startsWith("Confirmation") ? "destructive" : "default"}>
              <AlertDescription>{securityResult}</AlertDescription>
            </Alert>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass + " flex items-center gap-2"}>
              <Calendar className="size-5 text-primary" />
              Factory holidays
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Days when the full factory is closed. Used for working-day and rate
              calculations.
            </p>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...factoryHolidays]
                  .sort((a, b) =>
                    (a.date as string).localeCompare(b.date as string)
                  )
                  .map((h) => (
                    <TableRow key={h.id as string}>
                      <TableCell className="tabular-nums">
                        {h.date as string}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              title="Delete holiday"
                              aria-label={`Delete holiday ${h.date as string}`}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete holiday?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove {h.date as string} from factory holidays?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  try {
                                    await deleteHoliday(h.id as string);
                                    await load();
                                    toast.success("Holiday deleted");
                                  } catch {
                                    toast.error("Failed to delete holiday");
                                  }
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="flex flex-wrap gap-4 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!holidayDate.trim()) return;
              try {
                await saveHoliday({ date: holidayDate.trim() });
                setHolidayDate("");
                await load();
                toast.success("Holiday added");
              } catch {
                toast.error("Failed to add holiday");
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-date">Add date</Label>
              <DatePicker
                id="holiday-date"
                value={holidayDate}
                onChange={setHolidayDate}
                placeholder="Select date"
                className="w-48 min-h-[44px]"
              />
            </div>
            <Button type="submit" className={btnPrimaryClass}>
              Add holiday
            </Button>
          </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
