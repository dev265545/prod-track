"use client";

import * as React from "react";
import { toast } from "sonner";
import { Layers, Save, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useLanguage } from "@/components/language-provider";
import {
  getAppSettings,
  saveAppSettings,
} from "@/lib/services/appSettingsService";
import { readNumericInput } from "@/lib/utils/numericInput";
import {
  SUNDAY_PREMIUM_BOUNDS,
  clampSundayPremiumDefaults,
  sundayPremiumExample,
  type SundayPremiumDefaults,
} from "@/lib/utils/sundayPremiumDefaults";
import { SettingsSection, ToneAlert, type ToneMessage } from "./shared";

const FIELD = "min-h-[44px] w-28";

/**
 * The editor for the two factory-wide Sunday premium defaults.
 *
 * These were readable by the payroll engine and editable nowhere, which is the
 * exact failure this screen exists to end: a setting that appears configurable
 * but silently does nothing. Two things therefore get as much room as the
 * inputs do — *when* the numbers apply (they are the last of three sources, so
 * editing them may legitimately change nobody's pay), and a worked example in
 * rupees that recomputes as the owner types, the same teaching device the
 * Sunday rule editor uses.
 */
export function SundayPremiumDefaultsCard() {
  const { t } = useLanguage();
  /** The values on disk. The revert target when a save fails. */
  const [saved, setSaved] = React.useState<SundayPremiumDefaults | null>(null);
  const [draft, setDraft] = React.useState<SundayPremiumDefaults | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<ToneMessage>(null);

  React.useEffect(() => {
    let alive = true;
    getAppSettings()
      .then((settings) => {
        if (!alive) return;
        const next = clampSundayPremiumDefaults(
          {
            requiredPresentDays: settings.defaultSundayPremiumRequiredDays,
            multiplier: settings.defaultSundayPremiumMultiplier,
          },
          {
            requiredPresentDays: settings.defaultSundayPremiumRequiredDays,
            multiplier: settings.defaultSundayPremiumMultiplier,
          },
        );
        setSaved(next);
        setDraft(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const dirty =
    saved !== null &&
    draft !== null &&
    (saved.requiredPresentDays !== draft.requiredPresentDays ||
      saved.multiplier !== draft.multiplier);

  const example = sundayPremiumExample(
    draft ?? { requiredPresentDays: 26, multiplier: 1.2 },
  );

  const patch = (next: Partial<SundayPremiumDefaults>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
    setMessage(null);
  };

  const save = async () => {
    if (!draft || saved === null) return;
    const clean = clampSundayPremiumDefaults(draft, saved);
    setSaving(true);
    try {
      await saveAppSettings({
        defaultSundayPremiumRequiredDays: clean.requiredPresentDays,
        defaultSundayPremiumMultiplier: clean.multiplier,
      });
      setSaved(clean);
      setDraft(clean);
      setMessage({ tone: "success", text: t("setgPaySaved") });
      toast.success(t("setgPaySaved"));
    } catch (error) {
      console.error("[settings] could not save Sunday premium defaults", error);
      // Never leave a number on screen that the database does not hold.
      setDraft(saved);
      setMessage({ tone: "danger", text: t("setgPaySaveFailed") });
      toast.error(t("setgPaySaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      icon={Star}
      title={t("setgPayCardTitle")}
      description={t("setgPayCardDesc")}
    >
      <div className="flex min-w-0 flex-col gap-5">
        {/* Precedence first, above the inputs: the owner has to know these may
            be overridden before he changes them, not after. */}
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Layers className="size-5 shrink-0" aria-hidden />
            {t("setgPayWhenTitle")}
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-foreground">
            {t("setgPayWhenBody")}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="setgPayDays" className="text-base">
              {t("setgPayDaysLabel")}
            </Label>
            <NumberInput
              id="setgPayDays"
              className={FIELD}
              min={SUNDAY_PREMIUM_BOUNDS.minDays}
              max={SUNDAY_PREMIUM_BOUNDS.maxDays}
              disabled={draft === null || saving}
              value={draft === null ? "" : String(draft.requiredPresentDays)}
              onChange={(e) =>
                patch({
                  requiredPresentDays: readNumericInput(
                    e.target.value,
                    saved?.requiredPresentDays ?? 26,
                    {
                      min: SUNDAY_PREMIUM_BOUNDS.minDays,
                      max: SUNDAY_PREMIUM_BOUNDS.maxDays,
                    },
                  ),
                })
              }
            />
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t("setgPayDaysHelp")}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="setgPayTimes" className="text-base">
              {t("setgPayTimesLabel")}
            </Label>
            <NumberInput
              id="setgPayTimes"
              decimal
              className={FIELD}
              min={SUNDAY_PREMIUM_BOUNDS.minMultiplier}
              max={SUNDAY_PREMIUM_BOUNDS.maxMultiplier}
              disabled={draft === null || saving}
              value={draft === null ? "" : String(draft.multiplier)}
              onChange={(e) =>
                patch({
                  multiplier: readNumericInput(
                    e.target.value,
                    saved?.multiplier ?? 1.2,
                    {
                      min: SUNDAY_PREMIUM_BOUNDS.minMultiplier,
                      max: SUNDAY_PREMIUM_BOUNDS.maxMultiplier,
                    },
                  ),
                })
              }
            />
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t("setgPayTimesHelp")}
            </p>
          </div>
        </div>

        {/* Recomputed on every keystroke: seeing the rupees is what tells this
            audience whether the numbers they typed mean what they intended. */}
        <div
          aria-live="polite"
          className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface-3 p-4"
        >
          <p className="text-base font-semibold text-foreground">
            {t("setgPayExampleTitle")}
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-foreground">
            {t(example.key, example.vars)}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="min-h-[44px] px-5 py-3 text-base"
          >
            <Save data-icon="inline-start" className="size-5" aria-hidden />
            {saving ? t("setgPaySaving") : t("setgPaySave")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (saved) setDraft(saved);
              setMessage(null);
            }}
            disabled={!dirty || saving}
            className="min-h-[44px] px-5 py-3 text-base"
          >
            <Undo2 data-icon="inline-start" className="size-5" aria-hidden />
            {t("setgPayUndo")}
          </Button>
        </div>

        <ToneAlert message={message} />
      </div>
    </SettingsSection>
  );
}
