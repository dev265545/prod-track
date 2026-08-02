"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { isHumanSummary, type AuditEntry } from "@/lib/services/auditService";
import {
  categoryOfAction,
  formatDiffValue,
  humanizeField,
  readableChanges,
  type AuditCategory,
} from "@/lib/services/auditLogView";

const CATEGORY_LABEL: Record<AuditCategory, MessageKey> = {
  auth: "auditCatAuth",
  attendance: "auditCatAttendance",
  production: "auditCatProduction",
  money: "auditCatMoney",
  people: "auditCatPeople",
  stock: "auditCatStock",
  settings: "auditCatSettings",
  data: "auditCatData",
  other: "auditCatOther",
};

export function categoryLabelKey(category: AuditCategory): MessageKey {
  return CATEGORY_LABEL[category];
}

/** `admin` / `worker` / nothing, spelled the way the owner would say it. */
export function roleLabelKey(role: string | null): MessageKey {
  if (role === "admin") return "auditRoleAdmin";
  if (role === "worker") return "auditRoleWorker";
  return "auditRoleUnknown";
}

/**
 * Rows are rendered as a list of sentences rather than as a data table.
 *
 * A table of When / Who / Entity / Action columns is exactly the format the
 * client said he could not read, and at 320px it would need a horizontal
 * scroller before the first useful column arrived. A sentence with the details
 * underneath it fits any width and needs no column headings to decode.
 */
export function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = React.useState(false);

  const category = categoryOfAction(entry.action);
  const changes = React.useMemo(() => readableChanges(entry.diff), [entry.diff]);
  const unclear = !isHumanSummary(entry.summary);

  const when = React.useMemo(() => {
    const date = new Date(entry.timestamp);
    if (Number.isNaN(date.getTime())) return entry.timestamp;
    return date.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [entry.timestamp, locale]);

  const values = {
    empty: t("auditValueEmpty"),
    yes: t("auditValueYes"),
    no: t("auditValueNo"),
  };

  return (
    <li className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-base leading-relaxed break-words text-foreground">
            {entry.summary}
          </p>
          <p className="text-sm text-muted-foreground">
            <span>{when}</span>
            <span aria-hidden> · </span>
            <span>{t(roleLabelKey(entry.role))}</span>
            {entry.entity ? (
              <>
                <span aria-hidden> · </span>
                <span>{t("auditRecordRef", { entity: entry.entity })}</span>
              </>
            ) : null}
          </p>
          {unclear ? (
            <p className="flex items-start gap-1.5 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("auditSummaryUnclear")}
            </p>
          ) : null}
        </div>
        <Badge variant="secondary" className="w-fit shrink-0 text-sm">
          {t(categoryLabelKey(category))}
        </Badge>
      </div>

      {changes ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2 -ml-2 flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {open ? (
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            )}
            {open ? t("auditHideChanges") : t("auditShowChanges")}
          </button>
          {open ? (
            <dl className="mt-1 flex flex-col gap-2 rounded-lg bg-surface-3 p-3">
              {changes.map((change) => (
                <div
                  key={change.field}
                  className="flex flex-col gap-0.5 text-sm"
                >
                  <dt className="font-medium text-foreground">
                    {humanizeField(change.field)}
                  </dt>
                  <dd className="break-words text-muted-foreground">
                    {t("auditChangeWas")}: {formatDiffValue(change.before, values)}
                    <span aria-hidden> → </span>
                    {t("auditChangeNow")}: {formatDiffValue(change.after, values)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
