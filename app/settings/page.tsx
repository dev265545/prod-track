"use client";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, CalendarOff, Database, Info, KeyRound } from "lucide-react";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AboutCard } from "@/components/settings/about-card";
import { BackupCard } from "@/components/settings/backup-card";
import { BackupScheduleCard } from "@/components/settings/backup-schedule-card";
import { CalendarsTab } from "@/components/settings/calendars-tab";
import { CleanupCard } from "@/components/settings/cleanup-card";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import { OwnerPasswordCard } from "@/components/settings/owner-password-card";
import { ProductionLinkCard } from "@/components/settings/production-link-card";
import { RestoreCard } from "@/components/settings/restore-card";
import { WorkerPasswordCard } from "@/components/settings/worker-password-card";

const TABS: { value: string; labelKey: MessageKey; icon: React.ElementType }[] =
  [
    { value: "general", labelKey: "setgTabGeneral", icon: Info },
    { value: "production", labelKey: "cfgTabProduction", icon: Boxes },
    { value: "calendars", labelKey: "setgTabCalendars", icon: CalendarOff },
    { value: "data", labelKey: "setgTabData", icon: Database },
    { value: "security", labelKey: "setgTabSecurity", icon: KeyRound },
  ];

export default function SettingsPage() {
  const { t } = useLanguage();
  const { ready } = useAuthGuard({ requireAdmin: true });
  /** Bumped after a restore or a wipe so every tab re-reads from disk. */
  const [dataVersion, setDataVersion] = React.useState(0);
  const refresh = React.useCallback(() => setDataVersion((v) => v + 1), []);

  if (!ready) {
    return (
      <AppLoadingScreen
        title={t("loadingOpeningSettings")}
        description={t("loadingOpeningSettingsDesc")}
      />
    );
  }

  return (
    <AppShell>
      <main className="animate-fade-in flex w-full min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("settingsPageTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("setgIntro")}
          </p>
        </header>

        <Tabs defaultValue="general" className="w-full min-w-0 gap-8">
          <div className="-mx-1 w-full min-w-0 overflow-x-auto px-1 pb-1">
            <TabsList className="h-auto w-max gap-1 rounded-xl bg-surface-3 p-1.5">
              {TABS.map(({ value, labelKey, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-11 gap-2 rounded-lg px-4 text-base data-[state=active]:bg-card"
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  {t(labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="general" className="min-w-0">
            <AboutCard />
          </TabsContent>

          <TabsContent value="production" className="min-w-0">
            <ProductionLinkCard key={dataVersion} />
          </TabsContent>

          <TabsContent value="calendars" className="min-w-0">
            <CalendarsTab key={dataVersion} />
          </TabsContent>

          <TabsContent value="data" className="min-w-0">
            <div className="flex flex-col gap-6">
              <BackupCard />
              <BackupScheduleCard />
              <RestoreCard onRestored={refresh} />
              <CleanupCard />
              <div className="mt-4 border-t-2 border-destructive pt-6">
                <DangerZoneCard onCleared={refresh} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="min-w-0">
            <div className="flex flex-col gap-6">
              <OwnerPasswordCard />
              <WorkerPasswordCard />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </AppShell>
  );
}
