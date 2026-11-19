import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { setUnauthorizedHandler } from "../../api/client";
import { LoginScreen } from "./LoginScreen";
import { markSignedOut } from "./session";
import { useAuthStatus } from "./useAuthStatus";

/**
 * Shows the login screen when a password is required and the session is missing or has
 * expired; otherwise the app. If the status can't be read (backend offline) the app is
 * shown so it can report the problem itself.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStatus();

  useEffect(() => {
    setUnauthorizedHandler(() => markSignedOut(queryClient));
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  if (status.isPending) {
    return (
      <p className="auth-loading" role="status">
        {t("auth.checking")}
      </p>
    );
  }
  if (status.data?.enabled && !status.data.authenticated) return <LoginScreen />;
  return <>{children}</>;
}
