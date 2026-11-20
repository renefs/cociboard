import { useMutationState, type MutationKey, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Pending mutations are the single source of truth for "changes the server has not confirmed
 * yet" (ADR-0029). The cache holds the last server state; whatever is still waiting is laid
 * over it at read time with the pure `apply…` functions of each feature. That works the same
 * for a change made in this page load and for one restored from the device, and a change
 * that fails or settles simply stops being overlaid: there is no snapshot to roll back.
 */
export interface Pending<V> {
  variables: V;
  submittedAt: number;
}

function inOrder<V>(pending: Pending<V>[]): V[] {
  // `sort` is stable, so equal timestamps keep their cache order.
  return [...pending].sort((a, b) => a.submittedAt - b.submittedAt).map((entry) => entry.variables);
}

/** The variables of the pending mutations under `mutationKey`, oldest first. */
export function pendingVariables<V>(queryClient: QueryClient, mutationKey: MutationKey): V[] {
  return inOrder(
    queryClient
      .getMutationCache()
      .findAll({ mutationKey, status: "pending" })
      .map((mutation) => ({ variables: mutation.state.variables as V, submittedAt: mutation.state.submittedAt })),
  );
}

/** Like `pendingVariables`, re-rendering whenever the set of pending mutations changes. */
export function usePendingVariables<V>(mutationKey: MutationKey): V[] {
  const pending = useMutationState<Pending<V>>({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => ({ variables: mutation.state.variables as V, submittedAt: mutation.state.submittedAt }),
  });
  return useMemo(() => inOrder(pending), [pending]);
}
