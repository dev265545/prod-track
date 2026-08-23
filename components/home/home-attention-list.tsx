"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * "Needs your attention today", but every line is the door to the fix.
 *
 * The old list stated problems and left the operator to work out where to go.
 * Each row here is a whole link with the same "Fix this" affordance, so the
 * gap between reading a problem and being on the screen that solves it is one
 * tap. Tone drives a dot only — the sentence always says what is wrong, so an
 * operator who cannot distinguish amber from red loses nothing.
 */

export type HomeAttentionTone = "warning" | "destructive";

export interface HomeAttentionItem {
  key: string;
  /** Already-interpolated sentence, e.g. "3 people have no job type set". */
  label: string;
  href: string;
  tone?: HomeAttentionTone;
}

const DOT: Record<HomeAttentionTone, string> = {
  warning: "bg-warning",
  destructive: "bg-destructive",
};

export interface HomeAttentionListProps {
  /** `null` while loading; `[]` renders the all-clear line. */
  items: HomeAttentionItem[] | null;
  className?: string;
}

export function HomeAttentionList({ items, className }: HomeAttentionListProps) {
  const { t } = useLanguage();
  const hasItems = items !== null && items.length > 0;

  return (
    <section
      aria-label={t("homeNeedsAttention")}
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {hasItems ? (
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        )}
        {t("homeNeedsAttention")}
      </h2>

      {items === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full max-w-md rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("homeAllClear")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key} className="min-w-0">
              <Link
                href={item.href}
                className="flex min-h-[52px] min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    DOT[item.tone ?? "warning"],
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-base leading-snug">
                  {item.label}
                </span>
                <span className="hidden shrink-0 text-sm font-medium text-muted-foreground sm:inline">
                  {t("homeAttentionFix")}
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
