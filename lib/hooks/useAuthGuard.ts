"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { openDB } from "@/lib/db/adapter";
import {
  isLoggedIn,
  checkExpiry,
  isAdmin,
  getCurrentRole,
  touchSession,
  syncSessionNonceFromDb,
  type AppRole,
} from "@/lib/auth";

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
      .then(() => syncSessionNonceFromDb())
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
  }, [router, options?.requireAdmin]);

  // Refresh the 30-minute idle timer on real user activity, and re-check the
  // session periodically so an idle/expired/invalidated session is evicted
  // without waiting for a navigation.
  useEffect(() => {
    if (!ready) return;
    const onActivity = () => touchSession();
    const events = ["click", "keydown", "pointerdown", "scroll"] as const;
    for (const e of events) {
      window.addEventListener(e, onActivity, { passive: true });
    }
    const interval = window.setInterval(() => {
      if (!isLoggedIn()) {
        checkExpiry();
        router.replace("/login");
      }
    }, 60_000);
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      window.clearInterval(interval);
    };
  }, [ready, router]);

  return { ready, role };
}
