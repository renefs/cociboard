import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHealth } from "./api/client";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { ExposureBanner } from "./features/auth/ExposureBanner";
import { LogoutButton } from "./features/auth/LogoutButton";
import { useAuthStatus } from "./features/auth/useAuthStatus";
import { BackupButton } from "./features/backup/BackupButton";
import { BackupDialog } from "./features/backup/BackupDialog";
import { Planner } from "./features/planner/Planner";
import { Toast, type ToastMessage } from "./features/planner/Toast";

type VersionState = { kind: "loading" } | { kind: "ready"; version: string } | { kind: "offline" };

export default function App() {
  const { t } = useTranslation();
  const [backupOpen, setBackupOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const auth = useAuthStatus();
  const notify = useCallback((kind: ToastMessage["kind"], text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, kind, text });
  }, []);
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
        <h1 className="app-title">{t("app.title")}</h1>
        <div className="app-header-tools">
          <BackupButton onClick={() => setBackupOpen(true)} />
          {auth.data?.enabled && <LogoutButton onError={(text) => notify("error", text)} />}
          <LanguageSwitcher />
        </div>
      </header>
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
