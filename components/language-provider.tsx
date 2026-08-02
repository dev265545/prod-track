"use client";

import * as React from "react";
import {
  interpolate,
  messages,
  type MessageKey,
} from "@/lib/i18n/messages";
import {
  LOCALE_STORAGE_KEY,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/locale";
import { useHydrated } from "@/lib/hooks/useClientValue";

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  mounted: boolean;
};

const LanguageContext = React.createContext<LanguageContextValue | null>(
  null,
);

/**
 * The chosen language lives in `localStorage`, which is an external store, so
 * it is read as one.
 *
 * It used to be `useState("en")` corrected by an effect: every visitor got a
 * guaranteed second render, and a Hindi-speaking operator saw one frame of
 * English on every single navigation. `useSyncExternalStore` renders "en" on
 * the server (matching the markup Next.js produced) and the stored answer from
 * hydration onward, with nothing in between.
 *
 * `localStorage` throws in a locked-down browser and returns a fresh string
 * each read, so the snapshot is cached: `useSyncExternalStore` compares by
 * identity and would loop for ever on a new value every call.
 */
const localeListeners = new Set<() => void>();
let cachedLocale: AppLocale = "en";

function subscribeLocale(onChange: () => void): () => void {
  localeListeners.add(onChange);
  // A change made in another tab.
  const onStorage = () => onChange();
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    localeListeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function readLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(raw)) cachedLocale = raw;
    else cachedLocale = "en";
  } catch {
    /* a browser with storage switched off keeps whatever we last had */
  }
  return cachedLocale;
}

function writeLocale(next: AppLocale): void {
  cachedLocale = next;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  for (const listener of localeListeners) listener();
}

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = React.useSyncExternalStore(
    subscribeLocale,
    readLocale,
    () => "en" as AppLocale,
  );
  const mounted = useHydrated();

  const setLocale = React.useCallback((next: AppLocale) => {
    writeLocale(next);
  }, []);

  const toggleLocale = React.useCallback(() => {
    setLocale(locale === "en" ? "hi" : "en");
  }, [locale, setLocale]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale === "hi" ? "hi" : "en";
  }, [locale]);

  const t = React.useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const template =
        messages[locale][key] ?? messages.en[key] ?? String(key);
      return vars ? interpolate(template, vars) : template;
    },
    [locale],
  );

  const value = React.useMemo(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t,
      mounted,
    }),
    [locale, setLocale, toggleLocale, t, mounted],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
