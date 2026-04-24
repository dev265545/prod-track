"use client";

import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

type AppLoadingScreenProps = {
  title?: string;
  description?: string;
};

export function AppLoadingScreen({
  title = "Loading…",
  description,
}: AppLoadingScreenProps) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6">
      <div
        className="flex w-full max-w-md flex-col gap-8 animate-loading-screen-in"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
            <Spinner className="size-8 text-primary" />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
              {title}
            </p>
            {description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-2.5 w-4/5 rounded-full opacity-90" />
          <Skeleton className="h-2.5 w-3/5 rounded-full opacity-75" />
        </div>
      </div>
    </div>
  );
}
