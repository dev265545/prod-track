"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The shell every home dashboard panel wears: a titled card with a footer
 * link that goes straight to the screen where the thing gets fixed.
 *
 * The three panels (work made, attendance, stock) look identical on purpose —
 * an operator learns one shape and reads all three. Loading and empty are
 * states of *this* component, not of each panel, so a new factory can never
 * hit a half-drawn chart.
 *
 * Chrome 109 note: no Tailwind alpha modifiers anywhere in this folder. They
 * compile to `color-mix()`, which Chrome 109 drops back to a fully opaque
 * fill — the exact bug that once hid the icons on the hub cards. Solid tokens
 * only; where a wash is needed the chart uses SVG `fill-opacity`, which is an
 * SVG attribute and not a CSS color function.
 */
export interface HomeCardProps {
  title: string;
  /** Small line under the title, e.g. the date window. */
  subtitle?: string;
  icon: LucideIcon;
  /** Footer link — where the operator goes to act on what they just read. */
  href: string;
  linkLabel: string;
  loading?: boolean;
  /** Shown instead of the body: heading + one plain hint sentence. */
  empty?: { title: string; hint: string } | null;
  className?: string;
  children?: React.ReactNode;
}

export function HomeCard({
  title,
  subtitle,
  icon: Icon,
  href,
  linkLabel,
  loading = false,
  empty = null,
  className,
  children,
}: HomeCardProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground"
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <h2 className="font-heading text-lg font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <span className="text-sm text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 px-5 py-5 sm:px-6">
        {loading ? (
          <div className="flex flex-col gap-3" role="status" aria-live="polite">
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4 rounded-md" />
          </div>
        ) : empty ? (
          <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border px-4 py-6">
            <p className="text-base font-medium text-foreground">{empty.title}</p>
            <p className="text-sm text-muted-foreground">{empty.hint}</p>
          </div>
        ) : (
          children
        )}
      </div>

      <Link
        href={href}
        className="flex min-h-[48px] items-center justify-between gap-3 rounded-b-2xl border-t border-border px-5 py-3 text-base font-medium text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6"
      >
        <span className="min-w-0 truncate">{linkLabel}</span>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}
