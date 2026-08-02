"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { HardDriveDownload } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { SettingsSection, ToneAlert, type ToneMessage } from "./shared";
import { saveFullCopy, savePlainCopy } from "./backup-actions";

export function BackupCard() {
  const { t } = useLanguage();
  const [message, setMessage] = React.useState<ToneMessage>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (fn: typeof saveFullCopy) => {
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    setMessage(
      result.ok
        ? {
            tone: "success",
            text: result.downloaded
              ? t("setgBackupDownloaded")
              : t("setgBackupSaved"),
          }
        : {
            tone: "danger",
            text: t("setgBackupFailed", { msg: result.error }),
          },
    );
  };

  return (
    <SettingsSection
      icon={HardDriveDownload}
      title={t("setgBackupTitle")}
      description={t("setgBackupBody")}
    >
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => run(saveFullCopy)}
          className="min-h-[44px] px-6 text-base"
        >
          <HardDriveDownload className="size-5" aria-hidden />
          {t("setgBackupButton")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => run(savePlainCopy)}
          className="min-h-[44px] px-6 text-base"
        >
          {t("setgBackupButtonPlain")}
        </Button>
      </div>
      <ToneAlert message={message} />
    </SettingsSection>
  );
}
