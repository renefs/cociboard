import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, it, vi } from "vitest";
import { FORMAT_VERSION, MAX_AGE_MS, STORAGE_KEY, createEditsPersister } from "./persister";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function client(count: number, isPaused = false): PersistedClient {
  const mutation = { mutationKey: ["week-change", "2026-10-26"], state: { status: "pending", isPaused } };
  return {
    timestamp: 1,
    buster: "",
    clientState: { mutations: Array.from({ length: count }, () => mutation), queries: [] },
  } as unknown as PersistedClient;
}

const stored = (value: object) => JSON.stringify(value);

describe("createEditsPersister", () => {
  it("writes the latest state once per throttle window and restores it as paused", async () => {
    const storage = memoryStorage();
    const persister = createEditsPersister({ storage, throttleMs: 5 });
    void persister.persistClient(client(1));
    void persister.persistClient(client(2));
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    await vi.waitFor(() => expect(storage.getItem(STORAGE_KEY)).not.toBeNull());

    const restored = await persister.restoreClient();
    expect(restored?.clientState.mutations).toHaveLength(2);
    // A change that was in flight when the page closed is resumed like the others.
    expect(restored?.clientState.mutations.every((mutation) => mutation.state.isPaused)).toBe(true);
  });

  it("flush writes at once, and an empty state clears the storage", () => {
    const storage = memoryStorage();
    const persister = createEditsPersister({ storage, throttleMs: 10_000 });
    void persister.persistClient(client(1));
    persister.flush();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    void persister.persistClient(client(0));
    persister.flush();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards data older than the maximum age and reports how many changes that was", async () => {
    const onDiscard = vi.fn();
    const storage = memoryStorage({
      [STORAGE_KEY]: stored({ version: FORMAT_VERSION, savedAt: 1000, client: client(3) }),
    });
    const persister = createEditsPersister({ storage, now: () => 1000 + MAX_AGE_MS + 1, onDiscard });
    expect(await persister.restoreClient()).toBeUndefined();
    expect(onDiscard).toHaveBeenCalledWith(3);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps data just inside the maximum age", async () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: stored({ version: FORMAT_VERSION, savedAt: 1000, client: client(1) }),
    });
    const persister = createEditsPersister({ storage, now: () => 1000 + MAX_AGE_MS });
    expect(await persister.restoreClient()).toBeDefined();
  });

  it("discards data of another format version", async () => {
    const onDiscard = vi.fn();
    const storage = memoryStorage({
      [STORAGE_KEY]: stored({ version: FORMAT_VERSION + 1, savedAt: Date.now(), client: client(2) }),
    });
    const persister = createEditsPersister({ storage, onDiscard });
    expect(await persister.restoreClient()).toBeUndefined();
    expect(onDiscard).toHaveBeenCalledWith(2);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops corrupted data without throwing", async () => {
    const onDiscard = vi.fn();
    const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
    const persister = createEditsPersister({ storage, onDiscard });
    expect(await persister.restoreClient()).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("keeps working when storage throws", async () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error("blocked");
    };
    broken.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    broken.removeItem = () => {
      throw new Error("blocked");
    };
    const persister = createEditsPersister({ storage: broken, throttleMs: 0 });
    void persister.persistClient(client(1));
    expect(() => persister.flush()).not.toThrow();
    expect(await persister.restoreClient()).toBeUndefined();
    expect(() => persister.removeClient()).not.toThrow();
  });

  it("does nothing without storage", async () => {
    const persister = createEditsPersister({ storage: null });
    void persister.persistClient(client(1));
    persister.flush();
    expect(await persister.restoreClient()).toBeUndefined();
  });
});
