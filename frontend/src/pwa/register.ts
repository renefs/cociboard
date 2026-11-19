import { SKIP_WAITING_MESSAGE } from "../sw/shared";

/** The worker only works in a secure context (https or localhost) and in a production build. */
export function canRegisterServiceWorker(prod: boolean, nav: { serviceWorker?: unknown } = navigator): boolean {
  return prod && "serviceWorker" in nav && Boolean(nav.serviceWorker);
}

/**
 * Calls `onUpdate` with the worker that is waiting to take over (an installed worker while an
 * older one still controls the page). The very first install is not an update.
 * Returns a function that stops listening.
 */
export function trackUpdates(
  registration: ServiceWorkerRegistration,
  container: Pick<ServiceWorkerContainer, "controller">,
  onUpdate: (worker: ServiceWorker) => void,
): () => void {
  if (registration.waiting && container.controller) onUpdate(registration.waiting);

  const onUpdateFound = () => {
    const installing = registration.installing;
    if (!installing) return;
    const onStateChange = () => {
      if (installing.state === "installed" && container.controller) onUpdate(installing);
    };
    installing.addEventListener("statechange", onStateChange);
  };
  registration.addEventListener("updatefound", onUpdateFound);
  return () => registration.removeEventListener("updatefound", onUpdateFound);
}

/** Ask the waiting worker to take over and reload the page once, when it has. */
export function applyUpdate(
  worker: Pick<ServiceWorker, "postMessage">,
  container: Pick<ServiceWorkerContainer, "addEventListener">,
  reload: () => void = () => window.location.reload(),
): void {
  let reloaded = false;
  container.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  });
  worker.postMessage(SKIP_WAITING_MESSAGE);
}

/** Check for a new release whenever the page becomes visible again (installed apps stay open for days). */
export function updateOnVisible(registration: { update: () => Promise<unknown> }, doc: Document = document): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === "visible") void registration.update().catch(() => undefined);
  };
  doc.addEventListener("visibilitychange", onVisibility);
  return () => doc.removeEventListener("visibilitychange", onVisibility);
}

/** Register `/sw.js`. Resolves to a cleanup function, or undefined when it cannot be used. */
export async function registerServiceWorker(onUpdate: (worker: ServiceWorker) => void): Promise<(() => void) | undefined> {
  if (!canRegisterServiceWorker(import.meta.env.PROD)) return undefined;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const stopTracking = trackUpdates(registration, navigator.serviceWorker, onUpdate);
    const stopVisible = updateOnVisible(registration);
    return () => {
      stopTracking();
      stopVisible();
    };
  } catch {
    // The app works without the worker (e.g. an untrusted certificate).
    return undefined;
  }
}
