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
import { useLanguage } from "@/components/language-provider";

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
        title={t("loadingOpeningSettings")}
        description={t("loadingOpeningSettingsDesc")}
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
            {t("settingsPageTitle")}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
            {t("settingsPageIntro")}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className={headingClassFirst + " flex items-center gap-2"}>
              <Trash2 className="size-5 text-destructive" />
              {t("settingsDeleteHistoryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
          <p className={paraClass}>
            {t("settingsDeleteHistoryBody")}
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="historyBefore">
                {t("settingsDeleteHistoryDateLabel")}
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
                  {t("settingsDeleteHistoryButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settingsDeleteHistoryConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("settingsDeleteHistoryConfirmDesc", { date: historyBefore })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
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
                          t("settingsDeleteHistoryResult", {
                            prodCount,
                            advCount,
                          }),
                        );
                        toast.success(
                          t("settingsDeleteHistoryToast", {
                            prodCount,
                            advCount,
                          }),
                        );
                      } catch (e) {
                        setDeleteResult(
                          t("commonErrorWithMessage", {
                            msg: (e as Error).message,
                          }),
                        );
                        toast.error(t("settingsDeleteHistoryFail"));
                      }
                    }}
                  >
                    {t("commonDelete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {deleteResult && (
            <Alert className="mt-4" variant={deleteResult.startsWith("Error") || deleteResult.startsWith("गड़बड़") ? "destructive" : "default"}>
              <AlertDescription>{deleteResult}</AlertDescription>
            </Alert>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass + " flex items-center gap-2"}>
              <Download className="size-5 text-primary" />
              {t("settingsExportImportTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
          {isTauri() && dbPath && (
            <p className="text-sm text-muted-foreground mb-3 font-mono break-all">
              {t("settingsDbFileLine", { path: dbPath })}
            </p>
          )}
          <p className={paraClassMuted}>
            {t("settingsExportIntro", { autoPath: AUTO_IMPORT_PATH })}
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
                      setExportResult(t("settingsExportDbSaved"));
                    else setExportResult(t("settingsExportFailed", { msg: result.error ?? "" }));
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
                    setExportResult(t("settingsExportDbDownloaded"));
                  }
                } catch (e) {
                  setExportResult(
                    t("settingsExportFailed", { msg: (e as Error).message }),
                  );
                }
              }}
              className={btnPrimaryClass}
            >
              {t("settingsExportDb")}
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
                  setExportResult(t("settingsExportJsonDownloaded"));
                } catch (e) {
                  setExportResult(
                    t("settingsExportFailed", { msg: (e as Error).message }),
                  );
                }
              }}
              className="rounded-xl min-h-[44px] px-6 py-3"
            >
              {t("settingsExportJson")}
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
                        t("settingsConfirmImportReplace"),
                      )
                    )
                      return;
                    await importDatabase(data);
                    setExportResult(t("settingsImportDbComplete"));
                    load();
                    return;
                  }
                  const raw = await file.text();
                  const data = JSON.parse(raw);
                  const { valid, error } = validateExportData(data);
                  if (!valid) {
                    setExportResult(
                      t("settingsInvalidFile", { msg: error || "unknown" }),
                    );
                    return;
                  }
                  if (
                    !confirm(
                      t("settingsConfirmImportReplace"),
                    )
                  )
                    return;
                  await importDatabase(
                    data as Awaited<ReturnType<typeof exportDatabase>>,
                  );
                  setExportResult(t("settingsImportJsonComplete"));
                  load();
                } catch (err) {
                  setExportResult(
                    t("settingsImportFailed", { msg: (err as Error).message }),
                  );
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] px-6 py-3"
              onClick={() => importJsonInputRef.current?.click()}
            >
              {t("settingsImportFile")}
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
                      t("settingsConfirmAutoImport"),
                    )
                  )
                    return;
                  await importDatabase(result.data);
                  setExportResult(t("settingsAutoImportComplete"));
                  load();
                } catch (e) {
                  setExportResult(
                    t("settingsAutoImportFailed", { msg: (e as Error).message }),
                  );
                }
              }}
              className="rounded-xl border-2 border-primary text-primary hover:bg-accent min-h-[44px] px-6 py-3"
            >
              {t("settingsAutoImport")}
            </Button>
          </div>
          {exportResult && (
            <Alert className="mt-4" variant={/^(Export failed|Import failed|Invalid|एक्सपोर्ट फेल|इम्पोर्ट फेल|गलत फाइल)/.test(exportResult) ? "destructive" : "default"}>
              <AlertDescription>{exportResult}</AlertDescription>
            </Alert>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass + " flex items-center gap-2"}>
              <ShieldAlert className="size-5 text-primary" />
              {t("settingsSecurityTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
          <p className={paraClassMuted}>
            {t("settingsSecurityIntro")}
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const master = prompt(t("settingsPromptMaster"));
                if (master === null) return;
                if (!verifyMasterPassword(master)) {
                  setSecurityResult(t("settingsWrongMaster"));
                  return;
                }
                const new1 = prompt(t("settingsPromptNewPassword"));
                if (new1 === null) return;
                const new2 = prompt(t("settingsPromptConfirmPassword"));
                if (new2 === null) return;
                if (new1 !== new2) {
                  setSecurityResult(t("settingsPasswordMismatch"));
                  return;
                }
                await setAppPassword(new1.trim());
                setSecurityResult(t("settingsPasswordUpdated"));
              }}
              className="rounded-xl min-h-[44px] px-6 py-3"
            >
              {t("settingsChangePassword")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl min-h-[44px] px-6 py-3"
                >
                  {t("settingsMasterDelete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settingsMasterDeleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("settingsMasterDeleteDesc")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      const master = prompt(t("settingsPromptMasterConfirm"));
                      if (master === null) return;
                      if (!verifyMasterPassword(master)) {
                        setSecurityResult(t("settingsWrongMaster"));
                        toast.error(t("settingsWrongMaster"));
                        return;
                      }
                      const confirmText = prompt(t("settingsPromptTypeDelete"));
                      if (confirmText !== "DELETE") {
                        setSecurityResult(t("settingsConfirmMismatch"));
                        toast.error(t("settingsConfirmMismatch"));
                        return;
                      }
                      try {
                        await clearAllData();
                        setSecurityResult(t("settingsAllDataDeleted"));
                        toast.success(t("settingsAllDataDeleted"));
                        load();
                      } catch (e) {
                        setSecurityResult(
                          t("commonErrorWithMessage", {
                            msg: (e as Error).message,
                          }),
                        );
                        toast.error(t("settingsMasterDeleteFail"));
                      }
                    }}
                  >
                    {t("commonDelete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {securityResult && (
            <Alert
              className="mt-4"
              variant={
                [
                  t("settingsWrongMaster"),
                  t("settingsPasswordMismatch"),
                  t("settingsConfirmMismatch"),
                ].includes(securityResult) ||
                securityResult.startsWith("Error") ||
                securityResult.startsWith("गड़बड़")
                  ? "destructive"
                  : "default"
              }
            >
              <AlertDescription>{securityResult}</AlertDescription>
            </Alert>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={headingClass + " flex items-center gap-2"}>
              <Calendar className="size-5 text-primary" />
              {t("settingsFactoryHolidaysTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("settingsFactoryHolidaysIntro")}
            </p>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settingsHolidayColDate")}</TableHead>
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
                              title={t("settingsHolidayDeleteTitle")}
                              aria-label={t("settingsHolidayDeleteAria", {
                                date: String(h.date),
                              })}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("settingsHolidayDeleteTitle")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("settingsHolidayDeleteDesc", {
                                  date: String(h.date),
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  try {
                                    await deleteHoliday(h.id as string);
                                    await load();
                                    toast.success(t("settingsHolidayDeleteSuccess"));
                                  } catch {
                                    toast.error(t("settingsHolidayDeleteFail"));
                                  }
                                }}
                              >
                                {t("commonDelete")}
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
                toast.success(t("settingsHolidayAddSuccess"));
              } catch {
                toast.error(t("settingsHolidayAddFail"));
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-date">{t("settingsHolidayAddLabel")}</Label>
              <DatePicker
                id="holiday-date"
                value={holidayDate}
                onChange={setHolidayDate}
                placeholder={t("settingsHolidayDatePlaceholder")}
                className="w-48 min-h-[44px]"
              />
            </div>
            <Button type="submit" className={btnPrimaryClass}>
              {t("settingsHolidayAddButton")}
            </Button>
          </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
