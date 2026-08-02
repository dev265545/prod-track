"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flame } from "lucide-react";
import { toast } from "sonner";
import { verifyAppPassword } from "@/lib/auth";
import { clearAllData } from "@/lib/db/exportImport";
import { useLanguage } from "@/components/language-provider";
import {
  SettingsSection,
  PasswordField,
  ToneAlert,
  type ToneMessage,
} from "./shared";
import { saveFullCopy } from "./backup-actions";

/**
 * The single most destructive action in the app, deliberately fenced off at
 * the bottom of its own tab rather than sitting next to routine settings.
 * Confirmation happens in a real dialog with real inputs — `window.prompt`
 * both looked like a scam popup and behaved badly inside the Tauri webview.
 */
export function DangerZoneCard({ onCleared }: { onCleared: () => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<ToneMessage>(null);
  const [message, setMessage] = React.useState<ToneMessage>(null);
  const [savingCopy, setSavingCopy] = React.useState(false);
  /**
   * Whether a copy has actually been saved in this sitting. The button used to
   * `void saveFullCopy()` and discard the outcome, so a failed copy — a full
   * disk, a refused permission, a cancelled dialog — said nothing at all, and
   * the owner went on to wipe everything believing he had a backup. That is
   * the one place in this app where a silent failure is unrecoverable.
   */
  const [copySaved, setCopySaved] = React.useState(false);
  const word = t("setgDangerWord");

  const reset = () => {
    setPassword("");
    setTyped("");
    setDialogError(null);
  };

  const erase = async () => {
    setDialogError(null);
    if (!(await verifyAppPassword(password))) {
      setDialogError({ tone: "danger", text: t("setgDangerWrongPassword") });
      return;
    }
    if (typed.trim() !== word) {
      setDialogError({
        tone: "danger",
        text: t("setgDangerTypeMismatch", { word }),
      });
      return;
    }
    setBusy(true);
    try {
      await clearAllData();
      // Toast only. The banner below belongs to "save a copy first", which
      // the owner may still have to act on; the wipe itself said the same
      // sentence in both places.
      toast.success(t("setgDangerDone"));
      onCleared();
      setOpen(false);
      reset();
    } catch (e) {
      setDialogError({
        tone: "danger",
        text: t("setgDangerFailed", { msg: (e as Error).message }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      icon={Flame}
      title={t("setgDangerTitle")}
      description={t("setgDangerBody")}
      danger
    >
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] px-6 text-base"
          disabled={savingCopy}
          onClick={async () => {
            setSavingCopy(true);
            try {
              const outcome = await saveFullCopy();
              setCopySaved(outcome.ok);
              setMessage(
                outcome.ok
                  ? { tone: "success", text: t("bkpSaved") }
                  : { tone: "danger", text: t("bkpSaveFailed", { msg: outcome.error || "" }) },
              );
            } finally {
              setSavingCopy(false);
            }
          }}
        >
          {t("setgDangerSaveFirst")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-h-[44px] px-6 text-base"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Flame className="size-5" aria-hidden />
          {t("setgDangerButton")}
        </Button>
      </div>
      <ToneAlert message={message} />

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {t("setgDangerDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("setgDangerDialogDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Say it at the moment it matters. The owner may have pressed
              "save a copy first" and had it fail, or skipped it entirely;
              either way this is the last screen before the data is gone. */}
          {!copySaved ? (
            <p className="rounded-md border border-destructive bg-surface-2 p-3 text-sm text-foreground">
              {t("bkpLastSavedNever")}
            </p>
          ) : null}

          <div className="flex flex-col gap-4">
            <PasswordField
              id="danger-password"
              label={t("setgDangerPasswordLabel")}
              value={password}
              onChange={setPassword}
              showLabel={t("setgShowPassword")}
              hideLabel={t("setgHidePassword")}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="danger-typed" className="text-base">
                {t("setgDangerTypeLabel", { word })}
              </Label>
              <Input
                id="danger-typed"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="min-h-[44px] text-base tracking-widest"
              />
            </div>
            <ToneAlert message={dialogError} />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {t("commonCancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !password || typed.trim() !== word}
              className="min-h-[44px] text-base"
              onClick={() => void erase()}
            >
              {t("setgDangerConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
