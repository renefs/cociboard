import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getHealth } from "./api/client";
import { ExposureBanner } from "./features/auth/ExposureBanner";
import { useAuthStatus } from "./features/auth/useAuthStatus";
import { BackupDialog } from "./features/backup/BackupDialog";
import { SettingsMenu } from "./features/settings/SettingsMenu";
import { HouseholdDialog } from "./features/settings/HouseholdDialog";
import { useSaveHousehold } from "./features/settings/useHouseholdSettings";
import { Planner } from "./features/planner/Planner";
import { OfflineBanner } from "./pwa/OfflineBanner";
import { Toast, type ToastMessage } from "./features/planner/Toast";

type VersionState = { kind: "loading" } | { kind: "ready"; version: string } | { kind: "offline" };

export default function App() {
  const { t } = useTranslation();
  const [backupOpen, setBackupOpen] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const auth = useAuthStatus();
  const notify = useCallback((kind: ToastMessage["kind"], text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, kind, text });
  }, []);
  const saveHousehold = useSaveHousehold((text) => notify("error", text));
  const [backend, setBackend] = useState<VersionState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((health) => setBackend({ kind: "ready", version: health.version }))
      .catch(() => {
        if (!controller.signal.aborted) setBackend({ kind: "offline" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <ChefHat size={18} />
          </span>
          <h1 className="app-title">{t("app.title")}</h1>
        </div>
        <SettingsMenu
          onOpenHousehold={() => setHouseholdOpen(true)}
          onOpenBackup={() => setBackupOpen(true)}
          canLogout={auth.data?.enabled === true}
          onError={(text) => notify("error", text)}
        />
      </header>
      <OfflineBanner />
      {auth.data?.exposed && <ExposureBanner />}
      <main className="app-main">
        <Planner />
      </main>
      {backupOpen && (
        <BackupDialog
          onClose={() => setBackupOpen(false)}
          onNotify={notify}
        />
      )}
      {householdOpen && (
        <HouseholdDialog
          onClose={() => setHouseholdOpen(false)}
          onSave={(settings) => {
            saveHousehold(settings);
            setHouseholdOpen(false);
            notify("info", t("household.saved"));
          }}
        />
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
      <footer className="app-footer">
        <small>
          {backend.kind === "loading" && t("app.backendConnecting")}
          {backend.kind === "ready" && t("app.backendVersion", { version: backend.version })}
          {backend.kind === "offline" && t("app.backendOffline")}
        </small>
      </footer>
    </div>
  );
}
