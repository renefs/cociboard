export const LOCK_NAME = "cociboard-offline-edits";

type LockLike = Pick<LockManager, "request">;

/**
 * Only one tab at a time may restore, send and store the waiting changes; otherwise two tabs
 * opened on the same device would both send the stored ones. The tab holding the Web Lock is
 * the leader. A tab that is not the leader waits for the lock and takes over when the leader
 * closes. Without the Web Locks API (or if it fails) the tab leads at once: the pre-lock
 * behaviour, where two tabs could both send stored changes. Returns a function that stops
 * waiting (and, for the leader, releases the lock).
 */
export function claimLeadership(
  onLeader: () => void,
  locks: LockLike | undefined = typeof navigator === "undefined" ? undefined : navigator.locks,
): () => void {
  if (!locks) {
    onLeader();
    return () => undefined;
  }
  const abort = new AbortController();
  let release: (() => void) | null = null;
  locks
    .request(LOCK_NAME, { signal: abort.signal }, () => {
      onLeader();
      // Held until the tab is closed (the browser then releases it) or `stop` is called.
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onLeader();
    });
  return () => {
    abort.abort();
    release?.();
  };
}
