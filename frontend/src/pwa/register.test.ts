import { describe, expect, it, vi } from "vitest";
import { SKIP_WAITING_MESSAGE } from "../sw/shared";
import { applyUpdate, canRegisterServiceWorker, registerServiceWorker, trackUpdates, updateOnVisible } from "./register";

type Listener = () => void;

function fakeWorker(state = "installing") {
  const listeners = new Map<string, Listener[]>();
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    emit(type: string) {
      (listeners.get(type) ?? []).forEach((fn) => fn());
    },
  };
}

function fakeRegistration(init: { waiting?: unknown; installing?: unknown } = {}) {
  const listeners = new Map<string, Listener[]>();
  return {
    waiting: init.waiting ?? null,
    installing: init.installing ?? null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: Listener) =>
      listeners.set(type, (listeners.get(type) ?? []).filter((l) => l !== fn)),
    emit(type: string) {
      (listeners.get(type) ?? []).forEach((fn) => fn());
    },
    count: (type: string) => (listeners.get(type) ?? []).length,
  };
}

const asRegistration = (r: unknown) => r as ServiceWorkerRegistration;
const asWorker = (w: unknown) => w as ServiceWorker;

describe("canRegisterServiceWorker", () => {
  it("needs a production build and a service worker container", () => {
    expect(canRegisterServiceWorker(true, { serviceWorker: {} })).toBe(true);
    expect(canRegisterServiceWorker(false, { serviceWorker: {} })).toBe(false);
    expect(canRegisterServiceWorker(true, {})).toBe(false);
    expect(canRegisterServiceWorker(true, { serviceWorker: undefined })).toBe(false);
  });
});

describe("trackUpdates", () => {
  it("reports a worker that is already waiting when a page controls it", () => {
    const waiting = fakeWorker("installed");
    const onUpdate = vi.fn();
    trackUpdates(asRegistration(fakeRegistration({ waiting })), { controller: {} as ServiceWorker }, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith(waiting);
  });

  it("does not treat the first install as an update", () => {
    const installing = fakeWorker();
    const registration = fakeRegistration({ installing });
    const onUpdate = vi.fn();
    trackUpdates(asRegistration(registration), { controller: null }, onUpdate);
    registration.emit("updatefound");
    installing.state = "installed";
    installing.emit("statechange");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("reports a worker that finishes installing under an active one", () => {
    const installing = fakeWorker();
    const registration = fakeRegistration({ installing });
    const onUpdate = vi.fn();
    const stop = trackUpdates(asRegistration(registration), { controller: {} as ServiceWorker }, onUpdate);
    registration.emit("updatefound");
    installing.emit("statechange");
    expect(onUpdate).not.toHaveBeenCalled();
    installing.state = "installed";
    installing.emit("statechange");
    expect(onUpdate).toHaveBeenCalledWith(installing);
    stop();
    expect(registration.count("updatefound")).toBe(0);
  });
});

describe("applyUpdate", () => {
  it("posts SKIP_WAITING and reloads exactly once on controllerchange", () => {
    const worker = fakeWorker("installed");
    const container = new EventTarget();
    const reload = vi.fn();
    applyUpdate(asWorker(worker), container as unknown as ServiceWorkerContainer, reload);
    expect(worker.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange"));
    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("updateOnVisible", () => {
  it("checks for an update when the page becomes visible, not when it hides", () => {
    const registration = fakeRegistration();
    const stop = updateOnVisible(registration, document);
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(registration.update).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(registration.update).toHaveBeenCalledTimes(1);
    stop();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
});

describe("registerServiceWorker", () => {
  it("does nothing outside a production build", async () => {
    expect(await registerServiceWorker(vi.fn())).toBeUndefined();
  });

  it("registers /sw.js at the root scope in production", async () => {
    vi.stubEnv("PROD", true);
    const registration = fakeRegistration();
    const register = vi.fn(() => Promise.resolve(registration));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register, controller: null },
    });
    try {
      const stop = await registerServiceWorker(vi.fn());
      expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(registration.count("updatefound")).toBe(1);
      stop?.();
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
      vi.unstubAllEnvs();
    }
  });

  it("survives a failed registration", async () => {
    vi.stubEnv("PROD", true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: () => Promise.reject(new Error("insecure")) },
    });
    try {
      expect(await registerServiceWorker(vi.fn())).toBeUndefined();
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
      vi.unstubAllEnvs();
    }
  });
});
