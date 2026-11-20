import { useMutation, useQuery, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getHouseholdSettings, putHouseholdSettings } from "../../api/client";
import type { HouseholdSettings } from "../../api/types";
import i18n from "../../i18n";
import { retryAfterSignIn } from "../../offline/authRetry";
import { HOUSEHOLD_CHANGE_KEY } from "../../offline/keys";
import { pushNotice } from "../../offline/notices";
import { usePendingVariables } from "../../offline/pending";
import { describeSaveError } from "./householdLogic";

export const householdKey = ["household"] as const;

/** Every save replaces all the settings, so the newest waiting save is what the user sees. */
export function applyHouseholdSaves(
  settings: HouseholdSettings,
  waiting: readonly HouseholdSettings[],
): HouseholdSettings {
  return waiting.length > 0 ? (waiting[waiting.length - 1] as HouseholdSettings) : settings;
}

/** The settings as the user sees them: the server's, or the newest save still waiting. */
export function useHouseholdSettings() {
  const waiting = usePendingVariables<HouseholdSettings>([HOUSEHOLD_CHANGE_KEY]);
  const select = useCallback((settings: HouseholdSettings) => applyHouseholdSaves(settings, waiting), [waiting]);
  return useQuery({
    queryKey: householdKey,
    queryFn: ({ signal }) => getHouseholdSettings(signal),
    select,
  });
}

/** Requests are sent one at a time, in order. */
export const HOUSEHOLD_SCOPE = { id: "household" };

/**
 * What saving the preferences does, in this page or restored from the device (see
 * `registerMutationDefaults`). A success stores the server's settings as the base; once the
 * last save settles, everything the settings feed into is refetched: the household itself,
 * every week (its variety report) and the recipe candidates.
 */
export function householdMutationDefaults(
  queryClient: QueryClient,
): MutationOptions<HouseholdSettings, unknown, HouseholdSettings> {
  return {
    mutationFn: (settings) => retryAfterSignIn(() => putHouseholdSettings(settings)),
    onSuccess: (saved) => {
      queryClient.setQueryData<HouseholdSettings>(householdKey, saved);
    },
    onError: (error) => pushNotice(describeSaveError(error, i18n.t)),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: [HOUSEHOLD_CHANGE_KEY] }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: householdKey });
        void queryClient.invalidateQueries({ queryKey: ["week"] });
        void queryClient.invalidateQueries({ queryKey: ["candidates"] });
      }
    },
  };
}

/**
 * Saving the preferences. The settings show at once (`useHouseholdSettings` overlays the
 * newest waiting save); requests are sent one at a time (scope `household`), wait for the
 * connection and survive closing the app. A failure drops the overlay and is reported
 * through `onError`.
 */
export function useSaveHousehold(onError: (message: string) => void) {
  const { t } = useTranslation();
  const { mutate } = useMutation<HouseholdSettings, unknown, HouseholdSettings>({
    mutationKey: [HOUSEHOLD_CHANGE_KEY],
    scope: HOUSEHOLD_SCOPE,
    onError: (error) => onError(describeSaveError(error, t)),
  });
  return mutate;
}
