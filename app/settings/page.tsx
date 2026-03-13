"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { openDB } from "@/lib/db/adapter";
import {
  isLoggedIn,
  checkExpiry,
  verifyMasterPassword,
  setAppPassword,
} from "@/lib/auth";
import { getItems, saveItem, deleteItem } from "@/lib/services/itemService";
import { getShifts, saveShift, deleteShift } from "@/lib/services/shiftService";
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

export default function SettingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [factoryHolidays, setFactoryHolidays] = useState<
    Record<string, unknown>[]
  >([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [historyBefore, setHistoryBefore] = useState("");
  const [deleteResult, setDeleteResult] = useState("");
  const [exportResult, setExportResult] = useState("");
  const [securityResult, setSecurityResult] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemRate, setItemRate] = useState(0);
  const [shiftName, setShiftName] = useState("");
  const [shiftHours, setShiftHours] = useState(8);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [i, s, h] = await Promise.all([
      getItems(),
      getShifts(),
      getAllHolidays(),
    ]);
    setItems(i);
    setShifts(s);
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
      <AppShell>
        <main className="flex flex-col gap-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </main>
      </AppShell>
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
        <h1 className="text-3xl font-bold text-foreground font-heading">
          Settings &amp; data
        </h1>

        <Card>
          <CardHeader>
            <CardTitle className={headingClassFirst}>Delete historical data</CardTitle>
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
              <DatePicker
                id="historyBefore"
                value={historyBefore}
                onChange={setHistoryBefore}
                placeholder="Select date"
                className="w-full max-w-xs min-h-[44px]"
              />
            </div>
            <Button
              type="button"
              onClick={async () => {
                if (!historyBefore) {
                  setDeleteResult("Please select a date.");
                  return;
                }
                if (
                  !confirm(
                    `Delete all productions and advances before ${historyBefore}? This cannot be undone.`,
                  )
                )
                  return;
                try {
                  const [prodCount, advCount] = await Promise.all([
                    deleteProductionsBefore(historyBefore),
                    deleteAdvancesBefore(historyBefore),
                  ]);
                  setDeleteResult(
                    `Deleted ${prodCount} production(s) and ${advCount} advance(s).`,
                  );
                } catch (e) {
                  setDeleteResult("Error: " + (e as Error).message);
                }
              }}
              className={btnPrimaryClass}
            >
              Delete historical data
            </Button>
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
            <CardTitle className={headingClass}>Export / Import</CardTitle>
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
                    const blob = new Blob([bytes], {
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
            <CardTitle className={headingClass}>Security &amp; master actions</CardTitle>
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
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (
                  !confirm(
                    "Permanently delete ALL data? This cannot be undone. Continue?",
                  )
                )
                  return;
                const master = prompt("Enter master password to confirm");
                if (master === null) return;
                if (!verifyMasterPassword(master)) {
                  setSecurityResult("Incorrect master password.");
                  return;
                }
                const confirmText = prompt(
                  "Type DELETE (all caps) to confirm.",
                );
                if (confirmText !== "DELETE") {
                  setSecurityResult("Confirmation did not match.");
                  return;
                }
                try {
                  await clearAllData();
                  setSecurityResult("All data deleted.");
                  load();
                } catch (e) {
                  setSecurityResult("Error: " + (e as Error).message);
                }
              }}
              className="rounded-xl min-h-[44px] px-6 py-3"
            >
              Master delete all data
            </Button>
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
            <CardTitle className={headingClass}>Factory holidays</CardTitle>
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
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          title="Delete holiday"
                          aria-label={`Delete holiday ${h.date as string}`}
                          onClick={async () => {
                            await deleteHoliday(h.id as string);
                            load();
                          }}
                        >
                          <Trash2 data-icon="inline-start" aria-hidden />
                        </Button>
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
              await saveHoliday({ date: holidayDate.trim() });
              setHolidayDate("");
              load();
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

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground font-heading">
              Packaging item groups
            </CardTitle>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packaging item group</TableHead>
                  <TableHead className="text-right">Packaging price (₹)</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id as string}>
                    <TableCell>{i.name as string}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.rate as number}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        title="Delete packaging item group"
                        aria-label="Delete packaging item group"
                        onClick={async () => {
                          if (
                            confirm(
                              "Delete this packaging item group? Productions using it will keep the id but show as unknown.",
                            )
                          ) {
                            await deleteItem(i.id as string);
                            load();
                          }
                        }}
                      >
                        <Trash2 data-icon="inline-start" aria-hidden />
                      </Button>
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
              if (!itemName.trim()) return;
              await saveItem({
                name: itemName.trim(),
                rate: itemRate,
              });
              setItemName("");
              setItemRate(0);
              load();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="itemName">Packaging item group name</Label>
              <Input
                id="itemName"
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. RD CONT - 1000PCS"
                className="w-64 min-h-[44px]"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="itemRate">Packaging price (₹)</Label>
              <Input
                id="itemRate"
                type="number"
                min={0}
                step={0.01}
                value={itemRate}
                onChange={(e) => setItemRate(parseFloat(e.target.value) || 0)}
                className="w-28 min-h-[44px]"
              />
            </div>
            <Button type="submit" className={btnPrimaryClass}>
              Add packaging item group
            </Button>
          </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass}>Shifts</CardTitle>
          </CardHeader>
          <CardContent>
          <p className="text-base text-muted-foreground mb-5">
            Define shift names and hours per day. Used for production and salary
            reference.
          </p>
          <div className="overflow-x-auto mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Hours/day</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((s) => (
                  <TableRow key={s.id as string}>
                    <TableCell>{s.name as string}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.hoursPerDay as number}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        title="Delete shift"
                        aria-label="Delete shift"
                        onClick={async () => {
                          if (
                            confirm(
                              "Delete this shift? Records referencing it will keep the name but lose the link.",
                            )
                          ) {
                            await deleteShift(s.id as string);
                            load();
                          }
                        }}
                      >
                        <Trash2 data-icon="inline-start" aria-hidden />
                      </Button>
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
              if (!shiftName.trim()) return;
              await saveShift({
                name: shiftName.trim(),
                hoursPerDay: shiftHours,
              });
              setShiftName("");
              setShiftHours(8);
              load();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="shiftName">Name</Label>
              <Input
                id="shiftName"
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="e.g. 8AM-8PM"
                className="w-40 min-h-[44px]"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="shiftHours">Hours per day</Label>
              <Input
                id="shiftHours"
                type="number"
                min={1}
                max={24}
                value={shiftHours}
                onChange={(e) =>
                  setShiftHours(
                    Math.max(
                      1,
                      Math.min(24, parseInt(e.target.value, 10) || 8),
                    ),
                  )
                }
                className="w-24 min-h-[44px]"
              />
            </div>
            <Button type="submit" className={btnPrimaryClass}>
              Add shift
            </Button>
          </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
