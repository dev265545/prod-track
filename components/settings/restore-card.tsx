"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
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
import { ArrowRightLeft, PackageOpen, ShieldCheck, Upload } from "lucide-react";
import { getAll, STORES } from "@/lib/db/adapter";
import {
  fetchAutoImportData,
  importDatabase,
  validateExportData,
  type ExportData,
} from "@/lib/db/exportImport";
import { importDatabaseFromSqliteBuffer } from "@/lib/db/sqliteBrowser";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { SettingsSection, ToneAlert, type ToneMessage } from "./shared";
import { saveFullCopy } from "./backup-actions";

/**
 * Raw store names mean nothing to the owner, so they are folded into the
 * handful of things he actually recognises losing.
 */
const PREVIEW_GROUPS: { labelKey: MessageKey; stores: string[] }[] = [
  { labelKey: "setgStoreEmployees", stores: [STORES.EMPLOYEES] },
  { labelKey: "setgStoreAttendance", stores: [STORES.ATTENDANCE] },
  { labelKey: "setgStoreProductions", stores: [STORES.PRODUCTIONS] },
  {
    labelKey: "setgStoreAdvances",
    stores: [STORES.ADVANCES, STORES.ADVANCE_DEDUCTIONS],
  },
  {
    labelKey: "setgStoreSalary",
    stores: [STORES.SALARY_RECORDS, STORES.SALARY_SHEET_OVERRIDES],
  },
  {
    labelKey: "setgStoreItems",
    stores: [STORES.ITEMS, STORES.ITEM_COMBOS, STORES.MACHINES],
  },
  {
    labelKey: "setgStoreInventory",
    stores: [STORES.INVENTORY_ITEMS, STORES.INVENTORY_MOVEMENTS],
  },
  {
    labelKey: "setgStoreHolidays",
    stores: [STORES.FACTORY_HOLIDAYS, STORES.OPERATOR_NATIONAL_HOLIDAYS],
  },
  {
    labelKey: "setgStoreSettings",
    stores: [STORES.SHIFTS, STORES.SUNDAY_CATEGORIES],
  },
];

type PreviewRow = { labelKey: MessageKey; now: number; next: number };

type PendingRestore = {
  data: ExportData;
  fileName: string;
  rows: PreviewRow[];
  doneKey: MessageKey;
};

async function buildPreview(data: ExportData): Promise<PreviewRow[]> {
  const rows: PreviewRow[] = [];
  for (const group of PREVIEW_GROUPS) {
    let now = 0;
    let next = 0;
    for (const store of group.stores) {
      now += (await getAll(store)).length;
      next += data.stores[store]?.length ?? 0;
    }
    if (now === 0 && next === 0) continue;
    rows.push({ labelKey: group.labelKey, now, next });
  }
  return rows;
}

export function RestoreCard({ onRestored }: { onRestored: () => void }) {
  const { t } = useLanguage();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [message, setMessage] = React.useState<ToneMessage>(null);
  const [pending, setPending] = React.useState<PendingRestore | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [backupTaken, setBackupTaken] = React.useState(false);

  const openPreview = async (
    data: ExportData,
    fileName: string,
    doneKey: MessageKey,
  ) => {
    setBackupTaken(false);
    setPending({ data, fileName, rows: await buildPreview(data), doneKey });
  };

  const handleFile = async (file: File) => {
    setMessage({ tone: "info", text: t("setgRestoreReading") });
    const name = file.name.toLowerCase();
    const isSqlite =
      name.endsWith(".db") ||
      name.endsWith(".sqlite") ||
      name.endsWith(".sqlite3");
    try {
      const data: ExportData = isSqlite
        ? await importDatabaseFromSqliteBuffer(await file.arrayBuffer())
        : JSON.parse(await file.text());
      const { valid, error } = validateExportData(data);
      if (!valid) {
        setMessage({
          tone: "danger",
          text: t("setgRestoreBadFile", { msg: error ?? "" }),
        });
        return;
      }
      setMessage(null);
      await openPreview(data, file.name, "setgRestoreDone");
    } catch (e) {
      setMessage({
        tone: "danger",
        text: t("setgRestoreFailed", { msg: (e as Error).message }),
      });
    }
  };

  const loadBundled = async () => {
    setMessage(null);
    try {
      const result = await fetchAutoImportData();
      if (!result.success) {
        setMessage({ tone: "danger", text: result.error });
        return;
      }
      await openPreview(result.data, t("setgBundledTitle"), "setgBundledDone");
    } catch (e) {
      setMessage({
        tone: "danger",
        text: t("setgBundledFailed", { msg: (e as Error).message }),
      });
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await importDatabase(pending.data);
      setMessage({ tone: "success", text: t(pending.doneKey) });
      onRestored();
    } catch (e) {
      setMessage({
        tone: "danger",
        text: t("setgRestoreFailed", { msg: (e as Error).message }),
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <SettingsSection
      icon={ArrowRightLeft}
      title={t("setgRestoreTitle")}
      description={t("setgRestoreBody")}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.db,.sqlite,.sqlite3,application/json,application/x-sqlite3"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] px-6 text-base"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-5" aria-hidden />
          {t("setgRestoreButton")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] px-6 text-base"
          onClick={() => void loadBundled()}
        >
          <PackageOpen className="size-5" aria-hidden />
          {t("setgBundledButton")}
        </Button>
      </div>
      <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("setgRestoreSafeNote")}
      </p>
      <ToneAlert message={message} />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("setgRestoreConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("setgRestoreConfirmFile", { name: pending?.fileName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p className="text-base leading-relaxed text-foreground">
            {t("setgRestoreConfirmWhat")}
          </p>

          <ul className="max-h-56 overflow-y-auto rounded-xl border border-border bg-surface-2 p-3 text-base">
            {pending?.rows.map((row) => (
              <li
                key={row.labelKey}
                className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-border px-1 py-2 last:border-b-0"
              >
                <span className="text-muted-foreground">{t(row.labelKey)}</span>
                <span className="tabular-nums text-foreground">
                  {row.now} → {row.next}
                </span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] w-full text-base"
            disabled={backupTaken}
            onClick={async () => {
              const result = await saveFullCopy();
              if (result.ok) setBackupTaken(true);
            }}
          >
            {backupTaken
              ? t("setgRestoreBackupFirstDone")
              : t("setgRestoreBackupFirst")}
          </Button>

          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {t("commonCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmRestore();
              }}
            >
              {t("setgRestoreConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
