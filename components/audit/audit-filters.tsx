"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/language-provider";
import {
  AUDIT_CATEGORIES,
  isFilterActive,
  type AuditCategory,
  type AuditFilter,
} from "@/lib/services/auditLogView";
import { categoryLabelKey, roleLabelKey } from "./audit-entry-row";

export function AuditFilters({
  filter,
  onChange,
  onClear,
  roles,
}: {
  filter: AuditFilter;
  onChange: (next: AuditFilter) => void;
  onClear: () => void;
  /** Roles actually present in the log, so the dropdown offers no dead ends. */
  roles: string[];
}) {
  const { t } = useLanguage();
  const set = <K extends keyof AuditFilter>(key: K, value: AuditFilter[K]) =>
    onChange({ ...filter, [key]: value });

  return (
    <section
      aria-label={t("auditFiltersTitle")}
      className="flex w-full min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="font-heading text-lg font-semibold text-foreground">
        {t("auditFiltersTitle")}
      </h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-search">{t("auditFilterSearch")}</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="audit-search"
            value={filter.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder={t("auditFilterSearchHint")}
            className="h-11 pl-10"
          />
        </div>
      </div>

      {/* One column at 320px, two from `sm`, four on a desk monitor. Every
          control keeps a 44px target at every width. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="audit-from">{t("auditFilterFrom")}</Label>
          <DatePicker
            id="audit-from"
            value={filter.from}
            onChange={(v) => set("from", v)}
            max={filter.to || undefined}
            className="h-11"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="audit-to">{t("auditFilterTo")}</Label>
          <DatePicker
            id="audit-to"
            value={filter.to}
            onChange={(v) => set("to", v)}
            min={filter.from || undefined}
            className="h-11"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="audit-kind">{t("auditFilterKind")}</Label>
          <Select
            value={filter.category}
            onValueChange={(v) => set("category", v as AuditCategory | "all")}
          >
            <SelectTrigger id="audit-kind" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("auditFilterAll")}</SelectItem>
              {AUDIT_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {t(categoryLabelKey(category))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="audit-who">{t("auditFilterWho")}</Label>
          <Select value={filter.role} onValueChange={(v) => set("role", v)}>
            <SelectTrigger id="audit-who" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("auditFilterAll")}</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(roleLabelKey(role))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isFilterActive(filter) ? (
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          className="h-11 w-full gap-2 sm:w-fit"
        >
          <X className="size-5 shrink-0" aria-hidden />
          {t("auditFilterClear")}
        </Button>
      ) : null}
    </section>
  );
}
