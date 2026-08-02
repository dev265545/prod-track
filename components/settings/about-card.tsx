"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Clock, HardDrive, Info } from "lucide-react";
import { isTauri } from "@/lib/db/adapter";
import { useLanguage } from "@/components/language-provider";
import { SettingsSection } from "./shared";

export function AboutCard() {
  const { t } = useLanguage();
  const [dbPath, setDbPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isTauri()) return;
    void import("@/lib/db/tauriDb").then(({ getDbPath }) =>
      getDbPath()
        .then(setDbPath)
        .catch(() => setDbPath(null)),
    );
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        icon={Info}
        title={t("setgAboutTitle")}
        description={t("setgAboutBody")}
      >
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-base font-medium text-foreground">
            <HardDrive className="size-5 shrink-0" aria-hidden />
            {t("setgAboutStorageTitle")}
          </p>
          {dbPath ? (
            <>
              <p className="text-base text-muted-foreground">
                {t("setgAboutStorageFile")}
              </p>
              <p className="overflow-x-auto rounded-lg bg-surface-3 px-3 py-2 font-mono text-sm break-all text-foreground">
                {dbPath}
              </p>
            </>
          ) : (
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("setgAboutStorageBrowser")}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Clock}
        title={t("setgAboutOtherSettingsTitle")}
        description={t("setgAboutOtherSettingsBody")}
      >
        <Button
          asChild
          variant="outline"
          className="min-h-[44px] w-fit px-6 text-base"
        >
          <Link href="/shifts">
            <Clock className="size-5" aria-hidden />
            {t("setgAboutOtherSettingsLink")}
          </Link>
        </Button>
      </SettingsSection>
    </div>
  );
}
