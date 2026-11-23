import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { logout } from "../../api/client";
import { discardWaitingEdits } from "../../offline/start";
import { markSignedOut } from "./session";

/** Ends the session; `onError` receives the message to show when it fails. */
export function useLogout(onError: (text: string) => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Waiting changes belong to the person who made them, not to the next one on this device.
      discardWaitingEdits(queryClient);
      markSignedOut(queryClient);
    },
    onError: () => onError(t("auth.logoutFailed")),
  });
}
