"use client";

import Link from "next/link";
import {
  ClipboardCheck,
  FileSpreadsheet,
  ListChecks,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { AppRole } from "@/lib/auth";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * The three things the daily operator opened the app to do.
 *
 * This is the loudest thing on the screen by design: filled primary slabs,
 * an icon *and* a word (a picture alone is guessed at; a word alone is
 * skipped), 120px tall so it is a thumb target rather than a link.
 *
 * Role: payroll is the only money-bearing route in the app, and it is a
 * *secondary* row shown to admins only — a worker session never renders it.
 * The role arrives as a prop; nothing here reads the session, so the gate
 * lives in one place and cannot drift out of step with the route guard.
 */
interface Action {
  key: string;
  href: string;
  icon: LucideIcon;
  labelKey: MessageKey;
  hintKey: MessageKey;
}

const OPERATOR_ACTIONS: Action[] = [
  {
    key: "attendance",
    href: "/attendance",
    icon: ClipboardCheck,
    labelKey: "homeCtaAttendance",
    hintKey: "homeCtaAttendanceHint",
  },
  {
    key: "production",
    href: "/production",
    icon: ListChecks,
    labelKey: "homeCtaProduction",
    hintKey: "homeCtaProductionHint",
  },
  {
    key: "stock",
    href: "/inventory",
    icon: PackagePlus,
    labelKey: "homeCtaStock",
    hintKey: "homeCtaStockHint",
  },
];

export interface HomeActionsProps {
  /** `"admin"` additionally reveals the payroll shortcut. Never read auth here. */
  role: AppRole | null;
  className?: string;
}

export function HomeActions({ role, className }: HomeActionsProps) {
  const { t } = useLanguage();
  const admin = role === "admin";

  return (
    <section aria-label={t("homeDoNowTitle")} className={className}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("homeDoNowTitle")}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OPERATOR_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.key} className="min-w-0">
              <Link
                href={action.href}
                className="flex h-full min-h-[120px] min-w-0 flex-col justify-between gap-3 rounded-2xl bg-primary p-5 text-primary-foreground no-underline shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary-foreground"
                  aria-hidden
                >
                  <Icon className="size-7" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-heading text-xl font-bold leading-tight tracking-tight">
                    {t(action.labelKey)}
                  </span>
                  <span className="text-sm leading-snug">
                    {t(action.hintKey)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {admin ? (
        <Link
          href="/salary-sheet"
          className="mt-3 flex min-h-[48px] min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-base font-medium text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate">{t("navSalarySheet")}</span>
        </Link>
      ) : null}
    </section>
  );
}
