export type AppLocale = "en" | "hi";

export const LOCALE_STORAGE_KEY = "prodtrack-locale";

export function isAppLocale(value: string | null): value is AppLocale {
  return value === "en" || value === "hi";
}
