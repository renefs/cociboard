import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHealth } from "./api/client";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { Planner } from "./features/planner/Planner";

type VersionState = { kind: "loading" } | { kind: "ready"; version: string } | { kind: "offline" };

export default function App() {
  const { t } = useTranslation();
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
        <LanguageSwitcher />
      </header>
      <main className="app-main">
        <Planner />
      </main>
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
