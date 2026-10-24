import i18next, { type i18n as I18n } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import es from "./locales/es";

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = Language | "auto";

/** localStorage key of the explicit language choice; absent while the language is automatic. */
export const LANGUAGE_STORAGE_KEY = "cociboard.language";

export const resources = { en: { translation: en }, es: { translation: es } } as const;

/**
 * Create an i18n instance. Detection order: saved preference, then `navigator.languages`
 * (any `es-*` gives Spanish), then English. The detector never writes: only an explicit
 * choice is stored (see `setLanguagePreference`), so "Auto" stays distinguishable.
 * `bindReact` registers the instance with react-i18next (only the app's global one does).
 */
export function createI18n({ bindReact = false } = {}): I18n {
  const instance = i18next.createInstance();
  instance.use(LanguageDetector);
  if (bindReact) instance.use(initReactI18next);
  void instance.init({
    resources,
    supportedLngs: [...LANGUAGES],
    fallbackLng: "en",
    load: "languageOnly",
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: [],
    },
  });
  return instance;
}

const i18n = createI18n({ bindReact: true });
export default i18n;

/** The active UI language, always one of the supported codes. */
export function currentLanguage(instance: I18n = i18n): Language {
  return instance.resolvedLanguage === "es" ? "es" : "en";
}

/** The saved choice, or "auto" when the language follows the browser. */
export function getLanguagePreference(): LanguagePreference {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "en" || stored === "es" ? stored : "auto";
  } catch {
    return "auto";
  }
}

/** Switch language and remember the choice; "auto" forgets it and re-detects. */
export async function setLanguagePreference(
  preference: LanguagePreference,
  instance: I18n = i18n,
): Promise<void> {
  try {
    if (preference === "auto") window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    else window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the language still changes for this visit.
  }
  await instance.changeLanguage(preference === "auto" ? undefined : preference);
}

/** Keep `<html lang>` in sync with the active language. */
export function syncDocumentLanguage(instance: I18n = i18n): void {
  const apply = () => {
    document.documentElement.lang = currentLanguage(instance);
  };
  apply();
  instance.on("languageChanged", apply);
}

syncDocumentLanguage();
