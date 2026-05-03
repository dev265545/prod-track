"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";

export interface PayrollPeriodBadgeProps {
  label: string;
  adjusted: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export function PayrollPeriodBadge({
  label,
  adjusted,
  loading = false,
  onClick,
}: PayrollPeriodBadgeProps) {
  const { t } = useLanguage();
  const body = (
    <>
      {label}{" "}
      {adjusted ? t("periodAdjusted") : t("periodNotAdjusted")}
    </>
  );
  const className = cn(
    "inline-flex max-w-full items-center justify-center rounded-full border px-2 py-0.5 text-center text-[10px] font-medium whitespace-normal ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:whitespace-nowrap",
    adjusted
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-border bg-muted text-muted-foreground",
  );

  if (onClick) {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className={className}
        aria-label={`${label}: ${adjusted ? t("periodAdjusted") : t("periodNotAdjusted")}. ${t("periodBadgeAdjustHint")}`}
      >
        {body}
      </button>
    );
  }

  return <span className={className}>{body}</span>;
}
