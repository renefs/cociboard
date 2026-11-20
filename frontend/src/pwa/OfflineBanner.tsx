import { useTranslation } from "react-i18next";
import { dismissNotice, useNotices } from "../offline/notices";
import { useIsOnline, useJustCameBack, usePausedMutationCount, useUnloadWarning } from "./online";

/**
 * Tells the user when the app is offline (what they see, and that edits wait), how many
 * changes are waiting, and briefly that the connection is back. The live region is always
 * mounted so screen readers announce each change.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useIsOnline();
  const waiting = usePausedMutationCount();
  const justBack = useJustCameBack(online);
  const notices = useNotices();
  useUnloadWarning(waiting > 0);

  const showOffline = !online;
  const showWaiting = waiting > 0;
  const showBack = online && justBack && !showWaiting;

  return (
    <div role="status" aria-live="polite" className="pwa-status">
      {(showOffline || showWaiting || showBack) && (
        <div className={`offline-banner${showOffline || showWaiting ? "" : " offline-banner--ok"}`}>
          {showOffline && <p>{t("pwa.offline")}</p>}
          {showWaiting && <p>{t("pwa.waiting", { count: waiting })}</p>}
          {showBack && <p>{t("pwa.backOnline")}</p>}
        </div>
      )}
      {notices.map((notice) => (
        <div key={notice.id} className="offline-banner">
          <p>{notice.text}</p>
          <button type="button" className="btn" onClick={() => dismissNotice(notice.id)}>
            {t("pwa.dismiss")}
          </button>
        </div>
      ))}
    </div>
  );
}
