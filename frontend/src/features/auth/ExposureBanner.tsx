import { useState } from "react";
import { useTranslation } from "react-i18next";

const STORAGE_KEY = "cociboard.exposureWarningDismissed";

function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Warns, once per browser session, that a password-less planner is reachable from outside. */
export function ExposureBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode: the banner simply returns on the next visit.
    }
  };

  return (
    <section className="exposure-banner" role="status" aria-labelledby="exposure-title">
      <div>
        <h2 id="exposure-title">{t("auth.exposedTitle")}</h2>
        <p>{t("auth.exposedBody")}</p>
      </div>
      <button type="button" className="btn" onClick={dismiss}>
        {t("auth.exposedDismiss")}
      </button>
    </section>
  );
}
