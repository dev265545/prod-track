"use client";

import * as React from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import {
  AUDIT_ACTIONS,
  record,
  type AuditEntry,
} from "@/lib/services/auditService";
import { exportFilename, toCsv, toJson } from "@/lib/services/auditLogView";

function triggerBrowserDownload(text: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Save the *currently filtered* view to a file.
 *
 * Filtered rather than everything on purpose: the owner exports what he is
 * looking at, which is how he would describe the file to somebody else ("the
 * advances from July"). The count and the filename go into the audit entry so
 * a later reader can tell a full archive from a narrow slice — and the export
 * itself is logged, because copying the record of everyone's work out of the
 * app is exactly the kind of action this log exists to remember.
 */
export function AuditExportCard({ entries }: { entries: AuditEntry[] }) {
  const { t } = useLanguage();

  const save = (format: "csv" | "json") => {
    try {
      const filename = exportFilename(format);
      const text =
        format === "csv"
          ? toCsv(
              entries,
              {
                when: t("auditCsvWhen"),
                what: t("auditCsvWhat"),
                who: t("auditCsvWho"),
                category: t("auditCsvKind"),
                action: t("auditCsvAction"),
                recordType: t("auditCsvRecordType"),
                recordId: t("auditCsvRecordId"),
                changes: t("auditCsvChanges"),
              },
              {
                empty: t("auditValueEmpty"),
                yes: t("auditValueYes"),
                no: t("auditValueNo"),
              },
            )
          : toJson(entries);
      triggerBrowserDownload(
        text,
        filename,
        format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      );
      void record(
        AUDIT_ACTIONS.auditExport,
        "audit_log",
        null,
        `Saved a copy of ${entries.length} activity log entries to a file`,
        { format, filename, count: entries.length },
      );
      toast.success(
        t("auditExportDone", { count: entries.length, file: filename }),
      );
    } catch (error) {
      console.error("[audit] export failed", error);
      toast.error(t("auditExportFailed"));
    }
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-lg font-semibold text-foreground">
        {t("auditExportTitle")}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("auditExportBody")}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() => save("csv")}
          disabled={entries.length === 0}
          className="h-11 w-full gap-2 sm:w-fit"
        >
          <FileSpreadsheet className="size-5 shrink-0" aria-hidden />
          {t("auditExportCsv")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => save("json")}
          disabled={entries.length === 0}
          className="h-11 w-full gap-2 sm:w-fit"
        >
          <Download className="size-5 shrink-0" aria-hidden />
          {t("auditExportJson")}
        </Button>
      </div>
    </section>
  );
}
