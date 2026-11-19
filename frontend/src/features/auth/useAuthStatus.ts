import { useQuery } from "@tanstack/react-query";
import { getAuthStatus } from "../../api/client";
import { AUTH_STATUS_KEY } from "./session";

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_STATUS_KEY,
    queryFn: ({ signal }) => getAuthStatus(signal),
    staleTime: Infinity,
    retry: false,
  });
}
