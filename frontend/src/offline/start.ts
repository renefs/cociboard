import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import i18n from "../i18n";
import { claimLeadership } from "./leader";
import { pushNotice } from "./notices";
import { STORAGE_KEY, createEditsPersister, isPersistedMutation, safeStorage, type EditsPersister } from "./persister";

export interface StartOptions {
  persister?: EditsPersister;
  locks?: Parameters<typeof claimLeadership>[1];
}

/**
 * Keep the waiting changes on the device (ADR-0029). When this tab is the leader (it holds
 * the Web Lock, see `claimLeadership`) the stored changes are restored into the mutation cache
 * and sent in their original order; from then on every change of the mutation cache is
 * written to storage. Only mutations are stored: the queries come from the service worker's
 * cache or the network. Call after `registerMutationDefaults` and `syncOnlineStatus`.
 * Returns a function that stops everything.
 */
export function startOfflineEdits(queryClient: QueryClient, options: StartOptions = {}): () => void {
  const persister =
    options.persister ??
    createEditsPersister({
      onDiscard: (count) => pushNotice(i18n.t("pwa.discarded", { count })),
    });
  let unsubscribe: (() => void) | null = null;
  let stopped = false;

  const stopWaiting = claimLeadership(() => {
    if (stopped) return;
    const [stop, restored] = persistQueryClient({
      queryClient,
      persister,
      // The persister checks the format version and the age itself, so it can report
      // how many changes it threw away; the library's own checks are neutral.
      buster: "",
      maxAge: Number.POSITIVE_INFINITY,
      dehydrateOptions: { shouldDehydrateMutation: isPersistedMutation, shouldDehydrateQuery: () => false },
    });
    unsubscribe = stop;
    restored.then(
      () => queryClient.resumePausedMutations(),
      () => undefined,
    );
  }, options.locks);

  // Throttled writes would lose a change made just before the tab is closed or backgrounded
  // (a phone may kill a hidden PWA without further notice), so flush when the page is hidden.
  const flush = () => persister.flush();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    stopWaiting();
    unsubscribe?.();
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * Throw the waiting changes away, in memory and on the device. Used by sign-out (the next
 * person on a shared device must not inherit them) and by a backup restore (they refer to data
 * that was just replaced). A request already on its way cannot be recalled.
 */
export function discardWaitingEdits(queryClient: QueryClient): void {
  const cache = queryClient.getMutationCache();
  for (const mutation of cache.getAll()) {
    if (isPersistedMutation(mutation)) cache.remove(mutation);
  }
  try {
    safeStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was stored.
  }
}
