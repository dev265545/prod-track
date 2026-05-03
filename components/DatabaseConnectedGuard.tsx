"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSqliteFileMode, openDB } from "@/lib/db/adapter";
import {
  SQLITE_FILE_ERROR,
  forgetSqliteFileAndClose,
  isFileSystemAccessSupported,
} from "@/lib/db/sqliteFileAdapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";

type GuardState = "idle" | "loading" | "ready" | "blocked";

function messageForError(
  code: string | undefined,
  fallback: string,
  t: (key: MessageKey) => string,
): string {
  switch (code) {
    case SQLITE_FILE_ERROR.NO_FILE:
      return t("dbErrNoFile");
    case SQLITE_FILE_ERROR.PERMISSION_DENIED:
      return t("dbErrPermission");
    case SQLITE_FILE_ERROR.READ_FAILED:
      return t("dbErrRead");
    case SQLITE_FILE_ERROR.NOT_SUPPORTED:
      return t("dbErrNotSupported");
    default:
      return fallback;
  }
}

export function DatabaseConnectedGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [state, setState] = useState<GuardState>("idle");
  const [detail, setDetail] = useState("");

  const skipGuard =
    !isSqliteFileMode() || pathname?.startsWith("/onboarding");

  const tryConnect = useCallback(async () => {
    if (skipGuard) {
      setState("ready");
      return;
    }
    setState("loading");
    setDetail("");
    try {
      await openDB();
      setState("ready");
    } catch (e) {
      const code = (e as Error & { code?: string })?.code;
      const msg = e instanceof Error ? e.message : String(e);
      setDetail(messageForError(code, msg, t));
      setState("blocked");
    }
  }, [skipGuard, t]);

  useEffect(() => {
    void tryConnect();
  }, [tryConnect]);

  const loadingScreen = useMemo(
    () => (
      <AppLoadingScreen
        title={t("loadingOpeningDatabase")}
        description={t("loadingOpeningDatabaseDesc")}
      />
    ),
    [t],
  );

  if (skipGuard) {
    return <>{children}</>;
  }

  if (state === "loading" || state === "idle") {
    return loadingScreen;
  }

  if (state === "blocked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl font-heading">
              {t("dbCannotOpenTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>{detail}</AlertDescription>
            </Alert>
            {!isFileSystemAccessSupported() ? null : (
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => void tryConnect()}>
                  {t("commonRetry")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await forgetSqliteFileAndClose();
                    /* relink=1 keeps FirstRunGuard from sending completed users back to / */
                    router.replace("/onboarding?relink=1");
                  }}
                >
                  {t("dbChooseDifferentFile")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
