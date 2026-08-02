"use client";

import * as React from "react";
import { Boxes, Check, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/components/language-provider";
import {
  getAppSettings,
  saveAppSettings,
} from "@/lib/services/appSettingsService";
import {
  readLegacyItemMap,
  unlinkedInventoryItems,
} from "@/lib/services/productionCatalog";
import { getItems } from "@/lib/services/itemService";
import { getInventoryItems } from "@/lib/services/inventoryService";
import { SettingsSection, ToneAlert, type ToneMessage } from "./shared";

interface LinkState {
  enabled: boolean;
  /** Stock items the production list has never heard of. */
  unlinked: string[];
}

/** Everything this card shows, read in one pass. */
async function fetchLinkState(): Promise<LinkState> {
  const [settings, legacyItems, inventoryItems, map] = await Promise.all([
    getAppSettings(),
    getItems(),
    getInventoryItems().catch(() => []),
    readLegacyItemMap(),
  ]);
  return {
    enabled: settings.productionInventoryLinkEnabled,
    unlinked: unlinkedInventoryItems(legacyItems, inventoryItems, map).map(
      (item) => item.name || item.code,
    ),
  };
}

/**
 * The one switch that decides where the production screen gets its item list.
 *
 * Rendered as two labelled buttons rather than a slider: the state has to be
 * readable across a workshop, in Hindi, on a 2013 laptop — a word and an icon
 * beat a moving knob. No Switch component exists in this project either, so
 * this avoids pulling in a new dependency for one control.
 */
export function ProductionLinkCard() {
  const { t } = useLanguage();
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<ToneMessage>(null);
  const [confirmOff, setConfirmOff] = React.useState(false);

  const [state, setState] = React.useState<LinkState | null>(null);

  const reload = React.useCallback(async () => {
    setState(await fetchLinkState());
  }, []);

  React.useEffect(() => {
    let alive = true;
    fetchLinkState()
      .then((next) => {
        if (alive) setState(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // `null` until the first read lands: neither button is shown as the answer
  // while we still do not know which one it is.
  const enabled = state === null ? null : state.enabled;
  const unlinked = state?.unlinked ?? [];

  const apply = React.useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        await saveAppSettings({
          productionInventoryLinkEnabled: next,
        });
        setMessage({ tone: "success", text: t("cfgSaved") });
        await reload();
      } catch (error) {
        console.error("[settings] could not save production link", error);
        // The previous value stays on screen: nothing changed on disk either.
        setMessage({ tone: "danger", text: t("cfgSaveFailed") });
      } finally {
        setSaving(false);
      }
    },
    [reload, t],
  );

  const choose = (next: boolean) => {
    if (enabled === null || saving || next === enabled) return;
    // Turning it off changes how the factory records work from now on, so it
    // is asked about. Turning it on only adds items, so it just happens.
    if (next === false) setConfirmOff(true);
    else void apply(true);
  };

  const OPTIONS = [
    { value: true, labelKey: "cfgOn" as const, icon: Link2 },
    { value: false, labelKey: "cfgOff" as const, icon: Link2Off },
  ];

  return (
    <SettingsSection
      icon={Boxes}
      title={t("cfgLinkCardTitle")}
      description={t("cfgLinkDesc")}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-base font-medium text-foreground">
          {t("cfgLinkTitle")}
        </p>

        <div
          role="group"
          aria-label={t("cfgLinkTitle")}
          className="flex min-w-0 flex-wrap gap-2"
        >
          {OPTIONS.map(({ value, labelKey, icon: Icon }) => (
            <Button
              key={String(value)}
              type="button"
              variant={enabled === value ? "default" : "outline"}
              aria-pressed={enabled === value}
              disabled={enabled === null || saving}
              onClick={() => choose(value)}
              className="min-h-[44px] min-w-[7rem] flex-1 px-5 sm:flex-none"
            >
              <Icon data-icon="inline-start" className="size-5" aria-hidden />
              {t(labelKey)}
            </Button>
          ))}
        </div>

        {enabled !== null && (
          <p
            aria-live="polite"
            className="flex min-w-0 items-start gap-2 text-base text-muted-foreground"
          >
            <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {enabled ? t("cfgLinkStateOn") : t("cfgLinkStateOff")}
            </span>
          </p>
        )}

        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("cfgLinkNote")}
        </p>

        {/* The client's actual question — "where are the two items I added?" —
            answered on the screen that controls it. */}
        {enabled === false && unlinked.length > 0 && (
          <ToneAlert
            message={{
              tone: "info",
              text: `${t("cfgUnlinkedTitle", { count: unlinked.length })} ${t(
                "cfgUnlinkedNames",
                { names: unlinked.join(", ") },
              )}`,
            }}
          />
        )}

        <ToneAlert message={message} />
      </div>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cfgLinkOffConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              {t("cfgLinkOffConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {t("cfgCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={() => void apply(false)}
            >
              {t("cfgLinkOffConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
