import type { Mutation } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { PERSISTED_MUTATION_KEYS } from "./keys";

/**
 * Version of the stored format (NOT the app version: updating the app must never silently
 * drop waiting changes). Bump it only when the shape of the stored data or of a mutation's
 * variables changes incompatibly; stored data of any other version is discarded, with a
 * notice saying how many changes that was (ADR-0029).
 */
export const FORMAT_VERSION = 1;
/** Waiting changes not touched for this long are discarded when the app starts. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const STORAGE_KEY = "cociboard.offline-edits";
/** Writes are batched: at most one per this many milliseconds (plus a flush when the page is hidden). */
export const WRITE_THROTTLE_MS = 250;

/** Only a pending change of a known kind can be restored (it needs defaults for its key). */
export function isPersistedMutation(mutation: Mutation): boolean {
  const kind = mutation.options.mutationKey?.[0];
  return (
    mutation.state.status === "pending" && typeof kind === "string" && PERSISTED_MUTATION_KEYS.includes(kind)
  );
}

/** `localStorage`, or null where it is missing or blocked (some private modes): the app works without it. */
export function safeStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    storage.getItem(STORAGE_KEY);
    return storage;
  } catch {
    return null;
  }
}

interface Envelope {
  version: number;
  savedAt: number;
  client: PersistedClient;
}

export interface EditsPersister extends Persister {
  /** Write the latest state now (the page is going away). */
  flush: () => void;
}

export interface PersisterOptions {
  storage?: Storage | null;
  now?: () => number;
  /** Called with the number of stored changes that were thrown away (too old, or another format). */
  onDiscard?: (count: number) => void;
  /** Throttle for tests. */
  throttleMs?: number;
}

function countMutations(value: unknown): number {
  const mutations = (value as { clientState?: { mutations?: unknown } } | null | undefined)?.clientState?.mutations;
  return Array.isArray(mutations) ? mutations.length : 0;
}

/**
 * Persister of the waiting changes in `localStorage`: a few kilobytes of JSON, read
 * synchronously before the first render, with no extra dependency. Every storage call is
 * wrapped, so a full, blocked or corrupted store loses persistence, never the app.
 */
export function createEditsPersister(options: PersisterOptions = {}): EditsPersister {
  const now = options.now ?? Date.now;
  const throttleMs = options.throttleMs ?? WRITE_THROTTLE_MS;
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  let latest: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const remove = () => {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do: the data is simply not cleared.
    }
  };

  const write = () => {
    timer = null;
    const client = latest;
    latest = null;
    if (!client || !storage) return;
    try {
      if (client.clientState.mutations.length === 0) {
        storage.removeItem(STORAGE_KEY);
        return;
      }
      const envelope: Envelope = { version: FORMAT_VERSION, savedAt: now(), client };
      storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // Quota exceeded or storage blocked: the changes still wait in memory.
    }
  };

  return {
    persistClient: (client) => {
      latest = client;
      if (timer === null) timer = setTimeout(write, throttleMs);
    },
    flush: () => {
      if (timer !== null) clearTimeout(timer);
      write();
    },
    restoreClient: () => {
      if (!storage) return undefined;
      let raw: string | null;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch {
        return undefined;
      }
      if (raw === null) return undefined;
      let envelope: Partial<Envelope> | null;
      try {
        envelope = JSON.parse(raw) as Partial<Envelope> | null;
      } catch {
        remove();
        return undefined;
      }
      if (!envelope || typeof envelope !== "object") {
        remove();
        return undefined;
      }
      const stale = envelope.version !== FORMAT_VERSION || typeof envelope.savedAt !== "number" ||
        now() - envelope.savedAt > MAX_AGE_MS;
      if (stale || !envelope.client) {
        const count = countMutations(envelope.client);
        remove();
        if (count > 0) options.onDiscard?.(count);
        return undefined;
      }
      const client = envelope.client;
      // A change that was being sent when the page closed is stored as running, not paused;
      // restored as paused it is resumed like the others. It may have reached the server
      // already: sending it again is harmless for every change except adding an item by name
      // (a duplicate), which is rare and visible (ADR-0029).
      for (const mutation of client.clientState.mutations) mutation.state.isPaused = true;
      // The envelope owns the age; the library's own check is switched off by the caller.
      return client;
    },
    removeClient: () => {
      latest = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      remove();
    },
  };
}
