import { useTranslation } from "react-i18next";
import type { Language } from "./index";

/** The active UI language ("en" | "es"); re-renders when it changes. */
export function useLocale(): Language {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === "es" ? "es" : "en";
}
