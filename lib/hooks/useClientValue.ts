"use client";

import * as React from "react";
import { getCurrentRole, isAdmin, type AppRole } from "@/lib/auth";

/**
 * Reading a browser-only value (the session role, a media query, the URL)
 * during render makes the server markup and the first client paint disagree,
 * which is why every one of these used to be a `useState` filled in by an
 * effect. That is the pattern React now warns about: it costs a whole extra
 * render pass, and between the two passes the screen is honestly wrong — for
 * `isAdmin()` that meant a worker could see a flash of the admin menu.
 *
 * `useSyncExternalStore` is the built-in answer. It takes a *server* snapshot
 * and a *client* snapshot, so React renders the safe value on the server, swaps
 * to the real one during hydration, and never leaves a torn frame in between.
 * No effect, no cascading render, and no window in which the wrong thing is on
 * screen.
 *
 * The `subscribe` functions listen on `storage`, which fires for changes made
 * in *other* tabs. Same-tab changes (login, logout, a language switch) either
 * navigate or set React state themselves, so nothing is missed.
 */

/** No source of change worth listening to; the snapshot is read once per render. */
function subscribeNever(): () => void {
  return () => {};
}

function subscribeToStorage(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * `false` while rendering on the server and through the first client render,
 * `true` afterwards. For markup that genuinely cannot be produced until the
 * browser is there — a portal target, a theme-dependent icon.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/** The signed-in role, or `null` on the server and when nobody is signed in. */
export function useCurrentRole(): AppRole | null {
  return React.useSyncExternalStore(
    subscribeToStorage,
    getCurrentRole,
    () => null,
  );
}

/** `false` on the server; the real answer once hydrated. */
export function useIsAdmin(): boolean {
  return React.useSyncExternalStore(
    subscribeToStorage,
    isAdmin,
    () => false,
  );
}

/**
 * A live media-query answer. `getServerSnapshot` returns `false` so the
 * desktop layout is what renders on the server — the same choice the old
 * `useState(undefined)` made, and the one that does not shift on a phone.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
