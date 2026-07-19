"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry, isAdmin, getCurrentRole, type AppRole } from "@/lib/auth";

export interface UseAuthGuardOptions {
  requireAdmin?: boolean;
}

export interface UseAuthGuardResult {
  ready: boolean;
  role: AppRole | null;
}

/**
 * Shared gate for every authenticated page: opens the DB, checks the
 * session, redirects to /login when not logged in (or expired), and
 * redirects Worker sessions away from admin-only pages. Mirrors the
 * per-page `openDB().then(...)` block that used to be duplicated across
 * the app's page components.
 */
export function useAuthGuard(options?: UseAuthGuardOptions): UseAuthGuardResult {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    openDB()
      .then(() => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        if (options?.requireAdmin && !isAdmin()) {
          router.replace("/");
          return;
        }
        setReady(true);
        setRole(getCurrentRole());
      })
      .catch((e) => {
        console.error(e);
        setReady(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, options?.requireAdmin]);

  return { ready, role };
}
