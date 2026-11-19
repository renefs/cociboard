import type { QueryClient } from "@tanstack/react-query";
import type { AuthStatus } from "../../api/types";

export const AUTH_STATUS_KEY = ["auth", "status"] as const;

/** Drop every cached query except the auth status (the data belongs to a closed session). */
export function dropSessionData(queryClient: QueryClient): void {
  void queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
}

/** Show the login screen: the session ended (logout) or the server rejected it. */
export function markSignedOut(queryClient: QueryClient): void {
  dropSessionData(queryClient);
  queryClient.setQueryData<AuthStatus>(AUTH_STATUS_KEY, { enabled: true, authenticated: false, exposed: false });
}
