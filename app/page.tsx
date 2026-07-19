"use client";

import { useLanguage } from "@/components/language-provider";
import { Dashboard } from "@/components/dashboard";
import { Spinner } from "@/components/ui/spinner";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";

export default function Home() {
  const { t } = useLanguage();
  const { ready } = useAuthGuard();

  if (!ready) {
    return (
      <div
        className="flex min-h-svh w-full items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-label={t("loading")}
      >
        <div className="flex flex-col items-center justify-center gap-6 animate-loading-screen-in">
          <Spinner className="size-16 text-primary stroke-[1.5]" />
          <span className="animate-loading-screen-in-delay text-lg font-medium text-muted-foreground">
            {t("loading")}
          </span>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
