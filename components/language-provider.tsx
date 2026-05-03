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

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = React.useState<AppLocale>("en");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isAppLocale(raw)) setLocaleState(raw);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  const setLocale = React.useCallback((next: AppLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
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
