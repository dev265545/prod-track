"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isFirstRunComplete, setFirstRunComplete } from "@/lib/onboarding";
import { openDB } from "@/lib/db/adapter";
import {
  getAppDbRecord,
  legacyWorkspaceHasData,
} from "@/lib/db/appMetadata";

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
        router.replace("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
