import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getHouseholdSettings, putHouseholdSettings } from "../../api/client";
import type { HouseholdSettings } from "../../api/types";
import { describeSaveError } from "./householdLogic";

export const householdKey = ["household"] as const;

export function useHouseholdSettings() {
  return useQuery({
    queryKey: householdKey,
    queryFn: ({ signal }) => getHouseholdSettings(signal),
  });
}

/**
 * Saving the preferences. The cache takes the new settings at once; requests are sent one at
 * a time (scope `household`) and pause offline like the other mutations. A failure rolls the
 * cache back and is reported through `onError`. Once the last save settles, everything the
 * settings feed into is refetched: the household itself, every week (its variety report) and
 * the recipe candidates.
 */
export function useSaveHousehold(onError: (message: string) => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutationKey = ["household-change"];

  const { mutate } = useMutation<HouseholdSettings, unknown, HouseholdSettings, { previous: HouseholdSettings | undefined }>({
    mutationKey,
    scope: { id: "household" },
    mutationFn: (settings) => putHouseholdSettings(settings),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: householdKey });
      const previous = queryClient.getQueryData<HouseholdSettings>(householdKey);
      queryClient.setQueryData<HouseholdSettings>(householdKey, settings);
      return { previous };
    },
    onError: (error, _settings, context) => {
      queryClient.setQueryData(householdKey, context?.previous);
      onError(describeSaveError(error, t));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: householdKey });
        void queryClient.invalidateQueries({ queryKey: ["week"] });
        void queryClient.invalidateQueries({ queryKey: ["candidates"] });
      }
    },
  });

  return mutate;
}
