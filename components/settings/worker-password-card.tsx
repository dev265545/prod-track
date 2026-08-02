"use client";

import * as React from "react";
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
import { ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import {
  MIN_PASSWORD_LENGTH,
  hasWorkerPassword,
  setWorkerPassword,
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
 * Behaviour here is deliberately unchanged from the version that was just
 * written: confirm field, same-as-owner guard, SET / NOT SET status, the
 * dismissible "you have not set one yet" upgrade warning, and the extra
 * confirmation dialog before saving. Only the shell around it moved.
 */
export function WorkerPasswordCard() {
  const { t } = useLanguage();
  const [value, setValue] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [error, setError] = React.useState<ToneMessage>(null);
  const [isSet, setIsSet] = React.useState<boolean | null>(null);
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    hasWorkerPassword()
      .then(setIsSet)
      .catch(() => {});
  }, []);

  const validateThenConfirm = async () => {
    setError(null);
    const next = value.trim();
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError({ tone: "danger", text: t("twoPwTooShort") });
      return;
    }
    if (next !== confirmValue.trim()) {
      setError({ tone: "danger", text: t("twoPwMismatch") });
      return;
    }
    // Reusing the admin password here would hand the daily user
    // full access the first time they guess it.
    if (await verifyAppPassword(next)) {
      setError({ tone: "danger", text: t("twoPwSameAsOwner") });
      return;
    }
    setConfirmOpen(true);
  };

  const save = async () => {
    try {
      await setWorkerPassword(value.trim());
    } catch (e) {
      setError({ tone: "danger", text: (e as Error).message });
      return;
    }
    setValue("");
    setConfirmValue("");
    setIsSet(true);
    // Toast only. The banner slot stays for validation errors the owner has
    // to fix; success used to fill both with the identical sentence.
    toast.success(t("settingsWorkerPasswordUpdated"));
  };

  return (
    <SettingsSection
      icon={Users}
      title={t("settingsWorkerPasswordTitle")}
      description={t("settingsWorkerPasswordIntro")}
    >
      {isSet === false && !noticeDismissed && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-destructive bg-surface-2 px-4 py-3">
          <p className="flex items-start gap-2.5 font-semibold text-destructive">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            {t("twoPwMissingTitle")}
          </p>
          <p className="text-base leading-relaxed text-foreground">
            {t("twoPwMissingBody")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] w-fit px-4 text-base"
            onClick={() => setNoticeDismissed(true)}
          >
            {t("twoPwMissingDismiss")}
          </Button>
        </div>
      )}

      {isSet !== null && (
        <p className="text-base font-medium text-muted-foreground">
          {isSet ? t("twoPwStatusSet") : t("twoPwStatusNotSet")}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full min-w-0 sm:w-56">
          <PasswordField
            id="workerPassword"
            label={t("settingsWorkerPasswordLabel")}
            value={value}
            onChange={setValue}
            showLabel={t("setgShowPassword")}
            hideLabel={t("setgHidePassword")}
          />
        </div>
        <div className="w-full min-w-0 sm:w-56">
          <PasswordField
            id="workerPasswordConfirm"
            label={t("twoPwConfirmLabel")}
            value={confirmValue}
            onChange={setConfirmValue}
            showLabel={t("setgShowPassword")}
            hideLabel={t("setgHidePassword")}
          />
        </div>
        <Button
          type="button"
          className="min-h-[44px] px-6 text-base"
          disabled={!value.trim() || !confirmValue.trim()}
          onClick={() => void validateThenConfirm()}
        >
          {t("settingsWorkerPasswordButton")}
        </Button>
      </div>

      <ToneAlert message={error} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("twoPwDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("twoPwDialogBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {t("commonCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={() => void save()}
            >
              {t("twoPwDialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
