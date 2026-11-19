import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHealth } from "./api/client";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
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
          <LanguageSwitcher />
        </div>
      </header>
      <main className="app-main">
        <Planner />
      </main>
      {backupOpen && (
        <BackupDialog
          onClose={() => setBackupOpen(false)}
          onNotify={(kind, text) => {
            toastId.current += 1;
            setToast({ id: toastId.current, kind, text });
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
