/**
 * Mutation key prefixes of the changes that wait on the device (ADR-0029). Only mutations
 * under these keys are stored; each one is registered in `registerMutationDefaults`.
 */
export const PLAN_CHANGE_KEY = "week-change";
export const SHOPPING_CHANGE_KEY = "shopping-change";
export const PANTRY_CHANGE_KEY = "pantry-change";
export const HOUSEHOLD_CHANGE_KEY = "household-change";
export const FAVOURITE_CHANGE_KEY = "favourite-change";

export const PERSISTED_MUTATION_KEYS: readonly string[] = [
  PLAN_CHANGE_KEY,
  SHOPPING_CHANGE_KEY,
  PANTRY_CHANGE_KEY,
  HOUSEHOLD_CHANGE_KEY,
  FAVOURITE_CHANGE_KEY,
];
