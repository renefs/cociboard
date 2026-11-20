import { QueryClient, QueryClientProvider, onlineManager, useMutation } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushNotice, resetNotices } from "../offline/notices";
import { OfflineBanner } from "./OfflineBanner";
import { syncOnlineStatus } from "./online";

function Harness() {
  const mutation = useMutation({ mutationFn: () => Promise.resolve("ok") });
  return (
    <>
      <button type="button" onClick={() => mutation.mutate()}>
        save
      </button>
      <OfflineBanner />
    </>
  );
}

function renderBanner() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

const setOnline = (online: boolean) => act(() => onlineManager.setOnline(online));

beforeEach(() => {
  onlineManager.setOnline(true);
  resetNotices();
});
afterEach(() => {
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("OfflineBanner", () => {
  it("is silent while online", () => {
    renderBanner();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("explains that the plan is the last saved one while offline, then says it is back", () => {
    vi.useFakeTimers();
    renderBanner();
    setOnline(false);
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline. You're seeing the last saved plan; changes will be saved when the connection returns.",
    );
    setOnline(true);
    expect(screen.getByRole("status")).toHaveTextContent("Back online");
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("counts the changes paused while offline and warns before leaving", async () => {
    renderBanner();
    setOnline(false);
    fireEvent.click(screen.getByText("save"));
    expect(await screen.findByText("1 change waiting to be saved")).toBeInTheDocument();
    fireEvent.click(screen.getByText("save"));
    expect(await screen.findByText("2 changes waiting to be saved")).toBeInTheDocument();

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("sends the paused changes when the connection returns, and stops warning", async () => {
    renderBanner();
    setOnline(false);
    fireEvent.click(screen.getByText("save"));
    expect(await screen.findByText("1 change waiting to be saved")).toBeInTheDocument();
    await act(async () => {
      onlineManager.setOnline(true);
      await Promise.resolve();
    });
    await screen.findByText("Back online");
    expect(screen.getByRole("status")).not.toHaveTextContent("waiting");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it("is written in Spanish when the language is Spanish", async () => {
    const { default: i18n } = await import("../i18n");
    await act(() => i18n.changeLanguage("es"));
    renderBanner();
    setOnline(false);
    expect(screen.getByRole("status")).toHaveTextContent("Estás sin conexión");
  });
  it("shows a notice about a restored change until it is dismissed", () => {
    renderBanner();
    act(() => pushNotice("Couldn't save the change."));
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save the change.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("syncOnlineStatus", () => {
  it("copies navigator.onLine into the online manager", () => {
    syncOnlineStatus({ onLine: false });
    expect(onlineManager.isOnline()).toBe(false);
    syncOnlineStatus({ onLine: true });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
