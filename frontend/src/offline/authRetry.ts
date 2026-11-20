import { ApiError } from "../api/client";

/** True for the `401 auth_required` the server sends when the session is missing or expired. */
export function isAuthRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    typeof error.detail === "object" &&
    error.detail !== null &&
    (error.detail as { code?: unknown }).code === "auth_required"
  );
}

let waiting: { promise: Promise<void>; resolve: () => void } | null = null;

function nextSignIn(): Promise<void> {
  if (!waiting) {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    waiting = { promise, resolve };
  }
  return waiting.promise;
}

/** Called once the user has signed in again: every request that waited for it is retried. */
export function notifySignedIn(): void {
  const current = waiting;
  waiting = null;
  current?.resolve();
}

/**
 * Run a request of a waiting change. If the session has expired (the API client has already
 * shown the login screen), the change is NOT failed and dropped: it stays pending, and so
 * stored on the device, until the user signs in, and is then sent again (ADR-0029).
 */
export async function retryAfterSignIn<T>(run: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (!isAuthRequired(error)) throw error;
      await nextSignIn();
    }
  }
}
