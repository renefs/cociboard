import { describe, expect, it, vi } from "vitest";
import { LOCK_NAME, claimLeadership } from "./leader";

/** A minimal Web Locks: one holder at a time, the others queue in order. */
function fakeLocks() {
  let held = false;
  const queue: (() => void)[] = [];
  const grant = (callback: () => Promise<void>, done: () => void) => {
    held = true;
    void callback().then(() => {
      held = false;
      done();
      queue.shift()?.();
    });
  };
  return {
    request: vi.fn((name: string, ...rest: unknown[]) => {
      const callback = rest[rest.length - 1] as () => Promise<void>;
      expect(name).toBe(LOCK_NAME);
      return new Promise<void>((resolve) => {
        if (held) queue.push(() => grant(callback, resolve));
        else grant(callback, resolve);
      });
    }),
  } as unknown as LockManager & { request: ReturnType<typeof vi.fn> };
}

describe("claimLeadership", () => {
  it("leads at once without the Web Locks API", () => {
    const onLeader = vi.fn();
    claimLeadership(onLeader, undefined);
    expect(onLeader).toHaveBeenCalledTimes(1);
  });

  it("lets only one tab lead and promotes the next when the leader goes away", async () => {
    const locks = fakeLocks();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = claimLeadership(first, locks);
    claimLeadership(second, locks);
    await Promise.resolve();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    stopFirst();
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
  });

  it("leads anyway when the lock request fails", async () => {
    const onLeader = vi.fn();
    const locks = { request: () => Promise.reject(new DOMException("denied", "SecurityError")) };
    claimLeadership(onLeader, locks as unknown as LockManager);
    await vi.waitFor(() => expect(onLeader).toHaveBeenCalledTimes(1));
  });
});
