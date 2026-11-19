import { onlineManager, useMutationState } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * TanStack assumes it is online until it hears an `offline` event, so a page opened without
 * a connection must be told. Call once at startup.
 */
export function syncOnlineStatus(nav: { onLine: boolean } = navigator): void {
  onlineManager.setOnline(nav.onLine);
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}

/** Mutations that wait for the connection (offline) or for an earlier change of the same week. */
export function usePausedMutationCount(): number {
  const paused = useMutationState({ filters: { status: "pending" }, select: (mutation) => mutation.state.isPaused });
  return paused.filter(Boolean).length;
}

/** True for a few seconds after the connection returns. */
export function useJustCameBack(online: boolean, ms = 4000): boolean {
  const wasOnline = useRef(online);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    if (online && !wasOnline.current) {
      setJustBack(true);
      const timer = setTimeout(() => setJustBack(false), ms);
      wasOnline.current = online;
      return () => clearTimeout(timer);
    }
    wasOnline.current = online;
    return undefined;
  }, [online, ms]);

  return online && justBack;
}

/** Ask the browser to confirm leaving the page while edits are still waiting to be saved. */
export function useUnloadWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
