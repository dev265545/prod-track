"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  MIN_PASSWORD_LENGTH,
  setAppPassword,
  verifyAppPassword,
} from "@/lib/auth";
import { useLanguage } from "@/components/language-provider";
import {
  PasswordField,
  SettingsSection,
  ToneAlert,
  type ToneMessage,
} from "./shared";

/**
 * Replaces three chained `window.prompt()` calls. Those could not be
 * cancelled halfway, showed the password in plain text on some platforms,
 * and are unreliable inside the Tauri webview.
 */
export function OwnerPasswordCard() {
  const { t } = useLanguage();
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<ToneMessage>(null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setAgain("");
    setDialogError(null);
  };

  const save = async () => {
    setDialogError(null);
    if (!(await verifyAppPassword(current))) {
      setDialogError({ tone: "danger", text: t("setgOwnerPwWrong") });
      return;
    }
    const trimmed = next.trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH) {
      setDialogError({
        tone: "danger",
        text: t("setgOwnerPwTooShort", { count: MIN_PASSWORD_LENGTH }),
      });
      return;
    }
    if (trimmed !== again.trim()) {
      setDialogError({ tone: "danger", text: t("setgOwnerPwMismatch") });
      return;
    }
    setBusy(true);
    try {
      await setAppPassword(trimmed);
      // One channel per event: the change is done and needs no follow-up, so
      // it is a toast. It used to also raise a banner carrying the very same
      // sentence, so the owner read it twice.
      toast.success(t("setgOwnerPwDone"));
      setOpen(false);
      reset();
    } catch (e) {
      setDialogError({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      icon={KeyRound}
      title={t("setgOwnerPwTitle")}
      description={t("setgOwnerPwBody")}
    >
      <Button
        type="button"
        className="min-h-[44px] w-fit px-6 text-base"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <KeyRound className="size-5" aria-hidden />
        {t("setgOwnerPwButton")}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("setgOwnerPwDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("setgOwnerPwDialogDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-4">
            <PasswordField
              id="owner-pw-current"
              label={t("setgOwnerPwCurrentLabel")}
              value={current}
              onChange={setCurrent}
              showLabel={t("setgShowPassword")}
              hideLabel={t("setgHidePassword")}
            />
            <PasswordField
              id="owner-pw-new"
              label={t("setgOwnerPwNewLabel")}
              value={next}
              onChange={setNext}
              showLabel={t("setgShowPassword")}
              hideLabel={t("setgHidePassword")}
            />
            <PasswordField
              id="owner-pw-again"
              label={t("setgOwnerPwConfirmLabel")}
              value={again}
              onChange={setAgain}
              showLabel={t("setgShowPassword")}
              hideLabel={t("setgHidePassword")}
            />
            <ToneAlert message={dialogError} />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {t("commonCancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={busy || !current || !next || !again}
              className="min-h-[44px] text-base"
              onClick={() => void save()}
            >
              {t("setgOwnerPwSave")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
