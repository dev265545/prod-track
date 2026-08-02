/**
 * Translation for code that runs outside React.
 *
 * `useLanguage()` is the idiom everywhere a component renders, and the print
 * builders in `lib/print/**` take a `tr` function from their caller. Neither
 * helps a pure util that is called deep inside a service: it has no hook and no
 * caller willing to thread a parameter through. Text produced there used to be
 * written in English by hand, which is how English landed on a printed payslip
 * handed to a Hindi-reading worker.
 *
 * The chosen language is `localStorage`, not React state, so it can be read
 * from anywhere in the browser. On the server (or a locked-down browser) the
 * read fails and English is used — the same fallback the provider makes.
 */
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

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

/** The language the operator picked, or English if it cannot be read. */
export function getStoredLocale(): AppLocale {
  try {
    const raw = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
    return isAppLocale(raw) ? raw : "en";
  } catch {
    return "en";
  }
}

/** A `t()` for one fixed language. */
export function translatorFor(locale: AppLocale): Translate {
  return (key, vars) => {
    const template = messages[locale][key] ?? messages.en[key] ?? String(key);
    return vars ? interpolate(template, vars) : template;
  };
}

/** A `t()` that follows the language the operator picked. */
export const translate: Translate = (key, vars) =>
  translatorFor(getStoredLocale())(key, vars);
