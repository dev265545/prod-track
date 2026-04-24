"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isFirstRunComplete, setFirstRunComplete } from "@/lib/onboarding";
import { openDB, isSqliteFileMode } from "@/lib/db/adapter";
import {
  getAppDbRecord,
  legacyWorkspaceHasData,
} from "@/lib/db/appMetadata";
import { getStoredMainSqliteHandle } from "@/lib/db/sqliteFileHandleStore";
import { shouldRedirectCompletedUserFromOnboarding } from "@/lib/onboarding/onboardingRedirectPolicy";

export function FirstRunGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (pathname && !pathname.startsWith("/onboarding")) {
        try {
          await openDB();
          if (cancelled) return;
          const meta = await getAppDbRecord();
          if (meta?.onboardingComplete) {
            setFirstRunComplete();
          } else if (!meta && (await legacyWorkspaceHasData())) {
            setFirstRunComplete();
          }
        } catch {
          /* e.g. sqlite-file: no file linked yet */
        }
      }

      if (cancelled) return;

      if (!isFirstRunComplete()) {
        if (
          pathname !== "/onboarding" &&
          pathname !== "/login"
        ) {
          router.replace("/onboarding");
        }
      } else if (pathname === "/onboarding") {
        const search =
          typeof window !== "undefined" ? window.location.search : "";
        const hasStoredHandle =
          (await getStoredMainSqliteHandle()) != null;
        if (
          !shouldRedirectCompletedUserFromOnboarding(pathname, search, {
            sqliteFileMode: isSqliteFileMode(),
            hasStoredSqliteHandle: hasStoredHandle,
          })
        ) {
          return;
        }
        router.replace("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
