"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LoadError } from "@/components/load-error";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, Calculator, Cog } from "lucide-react";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import { getMachines, type Machine } from "@/lib/services/machineService";
import { getItemCombos, type ItemCombo } from "@/lib/services/itemComboService";
import { getItems } from "@/lib/services/itemService";
import { buildItemLookups } from "@/lib/utils/machineRuntime";
import { MachinesCard } from "@/components/machine/machines-card";
import { ItemSetsCard } from "@/components/machine/item-sets-card";
import { RuntimeCalculator } from "@/components/machine/runtime-calculator";

interface PageData {
  machines: Machine[];
  combos: ItemCombo[];
  items: Record<string, unknown>[];
}

async function fetchPageData(): Promise<PageData> {
  const [machines, combos, items] = await Promise.all([
    getMachines(),
    getItemCombos(),
    getItems(),
  ]);
  return { machines, combos, items };
}

/**
 * Thin shell over `components/machine/**`. The screen does three unrelated
 * jobs — keep the machine list, keep the item sets, and work out how long to
 * run a machine — so each gets its own tab instead of a third card to scroll
 * past. The calculator stays on this route (rather than a route of its own)
 * because it is useless without the two record tabs beside it, and the nav
 * rail already carries one "Machines" entry.
 */
export default function MachinePage() {
  const { t } = useLanguage();
  const { ready: guardReady } = useAuthGuard();
  const [data, setData] = useState<PageData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    setData(await fetchPageData());
  }, []);

  /**
   * A failed read used to be turned into `EMPTY`, which the cards below render
   * as "no machines yet" — the owner was told his machine list was empty when
   * the database had thrown. Failed is now its own state, with a way back.
   */
  const retry = useCallback(() => {
    setLoadFailed(false);
    setData(null);
    fetchPageData()
      .then(setData)
      .catch((err) => {
        console.error("machines: load failed", err);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    if (!guardReady) return;
    retry();
  }, [guardReady, retry]);

  // Stable identities so the calculator's memoised maths only re-runs when the
  // item rows actually change.
  const { itemsById, itemNameById } = useMemo(
    () => buildItemLookups(data?.items ?? []),
    [data?.items],
  );

  if (loadFailed) {
    return (
      <AppShell>
        <main className="flex w-full min-w-0 flex-col gap-8">
          <LoadError onRetry={retry} />
        </main>
      </AppShell>
    );
  }

  if (!guardReady || data === null) {
    return (
      <AppLoadingScreen
        title={t("loadingOpeningMachine")}
        description={t("loadingOpeningMachineDesc")}
      />
    );
  }

  return (
    <AppShell>
      <main className="animate-fade-in flex w-full min-w-0 flex-col gap-8">
        {/* No `action`: three tabs, three unrelated jobs. The add forms live
            in the machines and item-sets cards and each card header links to
            its own form — a page-level button could only ever point at one of
            the three, and at whichever tab happens to be open. */}
        <PageHeader
          title={t("machinePageTitle")}
          intro={t("machinePageIntro")}
        />

        <Tabs defaultValue="machines" className="w-full min-w-0 gap-8">
          <div className="-mx-1 w-full min-w-0 overflow-x-auto px-1 pb-1">
            <TabsList className="h-auto w-max gap-1 rounded-xl bg-surface-3 p-1.5">
              <TabsTrigger
                value="machines"
                className="h-11 gap-2 rounded-lg px-4 text-base data-[state=active]:bg-card"
              >
                <Cog className="size-5 shrink-0" aria-hidden />
                {t("machineCardTitle")}
              </TabsTrigger>
              <TabsTrigger
                value="sets"
                className="h-11 gap-2 rounded-lg px-4 text-base data-[state=active]:bg-card"
              >
                <Boxes className="size-5 shrink-0" aria-hidden />
                {t("comboCardTitle")}
              </TabsTrigger>
              <TabsTrigger
                value="calculator"
                className="h-11 gap-2 rounded-lg px-4 text-base data-[state=active]:bg-card"
              >
                <Calculator className="size-5 shrink-0" aria-hidden />
                {t("runtimeCalcTitle")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="machines" className="min-w-0">
            <MachinesCard machines={data.machines} onChanged={reload} />
          </TabsContent>

          <TabsContent value="sets" className="min-w-0">
            <ItemSetsCard
              combos={data.combos}
              items={data.items}
              itemNameById={itemNameById}
              onChanged={reload}
            />
          </TabsContent>

          <TabsContent value="calculator" className="min-w-0">
            <RuntimeCalculator
              machines={data.machines}
              combos={data.combos}
              itemsById={itemsById}
              itemNameById={itemNameById}
            />
          </TabsContent>
        </Tabs>
      </main>
    </AppShell>
  );
}
