import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getLanguagePreference, setLanguagePreference, type LanguagePreference } from "./index";

const OPTIONS = [
  { value: "en", nameKey: "language.enName" },
  { value: "es", nameKey: "language.esName" },
  { value: "auto", nameKey: "language.autoName" },
] as const satisfies readonly { value: LanguagePreference; nameKey: string }[];

/** EN | ES | Auto. "Auto" forgets the saved choice and follows the browser again. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const [preference, setPreference] = useState<LanguagePreference>(getLanguagePreference);

  const choose = (next: LanguagePreference) => {
    setPreference(next);
    void setLanguagePreference(next);
  };

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      {OPTIONS.map(({ value, nameKey }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          title={t(nameKey)}
          lang={value === "auto" ? undefined : value}
          onClick={() => choose(value)}
        >
          {t(`language.${value}`)}
        </button>
      ))}
    </div>
  );
}
