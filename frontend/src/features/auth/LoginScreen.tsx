import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, login } from "../../api/client";
import type { TooManyAttemptsDetail } from "../../api/types";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { notifySignedIn } from "../../offline/authRetry";
import { AUTH_STATUS_KEY, dropSessionData } from "./session";

type LoginError = { kind: "wrong" } | { kind: "limited"; minutes: number } | { kind: "network" };

function toLoginError(error: unknown): LoginError {
  if (error instanceof ApiError) {
    if (error.status === 401) return { kind: "wrong" };
    if (error.status === 429) {
      const seconds = (error.detail as Partial<TooManyAttemptsDetail> | undefined)?.retry_after;
      return { kind: "limited", minutes: Math.max(1, Math.ceil((seconds ?? 60) / 60)) };
    }
  }
  return { kind: "network" };
}

/** Full-page password form, shown instead of the app while signed out. */
export function LoginScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      dropSessionData(queryClient);
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
      // Changes that waited for the session (see `retryAfterSignIn`) are sent now.
      notifySignedIn();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password || mutation.isPending) return;
    mutation.mutate(password);
  };

  const error = mutation.isError ? toLoginError(mutation.error) : null;
  let message: string | null = null;
  if (error?.kind === "wrong") message = t("auth.wrongPassword");
  else if (error?.kind === "limited") message = t("auth.tooManyAttempts", { count: error.minutes });
  else if (error?.kind === "network") message = t("auth.networkError");

  return (
    <div className="login-page">
      <header className="app-header">
        <span className="app-title" aria-hidden="true">
          {t("app.title")}
        </span>
        <div className="app-header-tools">
          <LanguageSwitcher />
        </div>
      </header>
      <main className="login">
        <h1 className="login-title">{t("app.title")}</h1>
        <p className="login-intro">{t("auth.loginIntro")}</p>
        <form className="login-form" onSubmit={submit}>
          {/* Lets password managers file the credential; the household has one shared login. */}
          <input
            className="visually-hidden"
            type="text"
            name="username"
            autoComplete="username"
            value="cociboard"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <div className="field">
            <label htmlFor="login-password">{t("auth.password")}</label>
            <div className="login-password">
              <input
                id="login-password"
                className="login-input"
                type={visible ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                aria-invalid={error ? true : undefined}
                aria-describedby="login-error"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="btn login-toggle"
                aria-pressed={visible}
                aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
                onClick={() => setVisible((value) => !value)}
              >
                <span aria-hidden="true">{visible ? "🙈" : "👁"}</span>
              </button>
            </div>
          </div>
          <div id="login-error" className="login-error" role="alert">
            {message}
          </div>
          <button type="submit" className="btn btn-primary btn-large" disabled={mutation.isPending}>
            {mutation.isPending ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>
      </main>
    </div>
  );
}
