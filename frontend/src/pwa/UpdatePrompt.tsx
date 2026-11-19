import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyUpdate, registerServiceWorker } from "./register";

/** Registers the service worker and, when a new release is waiting, offers to reload into it. */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void registerServiceWorker(setWaiting).then((stop) => {
      if (cancelled) stop?.();
      else cleanup = stop;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  if (!waiting) return null;
  return (
    <section className="update-prompt" role="status" aria-live="polite">
      <p>{t("pwa.updateAvailable")}</p>
      <button type="button" className="btn" onClick={() => applyUpdate(waiting, navigator.serviceWorker)}>
        {t("pwa.reload")}
      </button>
    </section>
  );
}
