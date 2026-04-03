"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

type GuardState = "idle" | "loading" | "ready" | "blocked";

function messageForError(code: string | undefined, fallback: string): string {
  switch (code) {
    case SQLITE_FILE_ERROR.NO_FILE:
      return "No database file is linked on this computer. If you use a USB stick, plug it in, then try again—or pick your database file again.";
    case SQLITE_FILE_ERROR.PERMISSION_DENIED:
      return "The browser needs permission to read and write your database file. Click Retry and choose Allow when asked.";
    case SQLITE_FILE_ERROR.READ_FAILED:
      return "The database file could not be read. It may be missing, empty, or damaged. Check that your USB drive is plugged in and try again.";
    case SQLITE_FILE_ERROR.NOT_SUPPORTED:
      return "This mode needs Google Chrome or Microsoft Edge. Please open ProdTrack in one of those browsers.";
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
      setDetail(messageForError(code, msg));
      setState("blocked");
    }
  }, [skipGuard]);

  useEffect(() => {
    void tryConnect();
  }, [tryConnect]);

  if (skipGuard) {
    return <>{children}</>;
  }

  if (state === "loading" || state === "idle") {
    return (
      <AppLoadingScreen
        title="Opening your database…"
        description="Connecting to your ProdTrack file. This usually takes a moment."
      />
    );
  }

  if (state === "blocked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl font-heading">
              We can&apos;t open your database
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>{detail}</AlertDescription>
            </Alert>
            {!isFileSystemAccessSupported() ? null : (
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => void tryConnect()}>
                  Retry
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
                  Choose a different database file…
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
