import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { logout } from "../../api/client";
import { markSignedOut } from "./session";

interface LogoutButtonProps {
  onError: (text: string) => void;
}

/** Header button that ends the session; rendered only when a password is set. */
export function LogoutButton({ onError }: LogoutButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => markSignedOut(queryClient),
    onError: () => onError(t("auth.logoutFailed")),
  });
  return (
    <button
      type="button"
      className="header-button"
      title={t("auth.logoutTitle")}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <span aria-hidden="true">🔒</span> <span className="header-button-label">{t("auth.logout")}</span>
    </button>
  );
}
