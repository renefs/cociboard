import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKIP_WAITING_MESSAGE } from "../sw/shared";
import { UpdatePrompt } from "./UpdatePrompt";

function installFakeServiceWorker() {
  const container = new EventTarget() as EventTarget & {
    controller: object | null;
    register: ReturnType<typeof vi.fn>;
  };
  const waiting = { postMessage: vi.fn(), state: "installed", addEventListener: vi.fn() };
  const registration = {
    waiting,
    installing: null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  container.controller = {};
  container.register = vi.fn(() => Promise.resolve(registration));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: container });
  return { container, waiting };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.unstubAllEnvs();
});

describe("UpdatePrompt", () => {
  it("renders nothing without a waiting worker (and in development)", () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a reload when a new version is waiting and activates it on click", async () => {
    vi.stubEnv("PROD", true);
    const { container, waiting } = installFakeServiceWorker();
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);

    render(<UpdatePrompt />);
    expect(await screen.findByText("A new version is available.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    act(() => {
      container.dispatchEvent(new Event("controllerchange"));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
