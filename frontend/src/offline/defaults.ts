import type { QueryClient } from "@tanstack/react-query";
import { householdMutationDefaults } from "../features/settings/useHouseholdSettings";
import { favouriteMutationDefaults } from "../features/recipes/useRecipeMutations";
import { planMutationDefaults } from "../features/planner/useWeekPlan";
import { pantryMutationDefaults } from "../features/shopping/usePantry";
import { shoppingMutationDefaults } from "../features/shopping/useShoppingList";
import {
  FAVOURITE_CHANGE_KEY,
  HOUSEHOLD_CHANGE_KEY,
  PANTRY_CHANGE_KEY,
  PLAN_CHANGE_KEY,
  SHOPPING_CHANGE_KEY,
} from "./keys";

/**
 * A mutation restored from the device has data but no functions. Everything it needs to run
 * (the request, what to do after it) is registered here per mutation key, and the variables
 * carry the rest, so a restored change behaves exactly like one made a moment ago. Call this
 * before the first mutation is created or restored.
 */
export function registerMutationDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults([PLAN_CHANGE_KEY], planMutationDefaults(queryClient));
  queryClient.setMutationDefaults([SHOPPING_CHANGE_KEY], shoppingMutationDefaults(queryClient));
  queryClient.setMutationDefaults([PANTRY_CHANGE_KEY], pantryMutationDefaults(queryClient));
  queryClient.setMutationDefaults([HOUSEHOLD_CHANGE_KEY], householdMutationDefaults(queryClient));
  queryClient.setMutationDefaults([FAVOURITE_CHANGE_KEY], favouriteMutationDefaults(queryClient));
}
