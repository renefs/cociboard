import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealth, setUnauthorizedHandler } from "../../api/client";
import type { AuthStatus } from "../../api/types";
import { renderWithQuery } from "../../test/utils";
import { AuthGate } from "./AuthGate";
import { ExposureBanner } from "./ExposureBanner";
import { LogoutButton } from "./LogoutButton";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));

/** A tiny fake API: the status flips to authenticated after a successful login. */
function mockServer(initial: AuthStatus, login: () => Promise<Response> = noContent) {
  let status = initial;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/auth/status") return json(status);
    if (url === "/api/auth/login") {
      return login().then((response) => {
        if (response.ok) status = { ...status, authenticated: true };
        return response;
      });
    }
    if (url === "/api/auth/logout") return noContent();
    return json({ method: init?.method ?? "GET" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const STATUS_OFF: AuthStatus = { enabled: false, authenticated: true, exposed: false };
const STATUS_IN: AuthStatus = { enabled: true, authenticated: true, exposed: false };
const STATUS_LOCKED: AuthStatus = { enabled: true, authenticated: false, exposed: false };

function renderGate() {
  return renderWithQuery(
    <AuthGate>
      <p>the app</p>
    </AuthGate>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  window.sessionStorage.clear();
});

describe("AuthGate", () => {
  it("shows a loading state, then the app when auth is disabled", async () => {
    mockServer(STATUS_OFF);
    renderGate();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(await screen.findByText("the app")).toBeInTheDocument();
  });

  it("shows the app when signed in", async () => {
    mockServer(STATUS_IN);
    renderGate();
    expect(await screen.findByText("the app")).toBeInTheDocument();
  });

  it("shows the login screen when a password is required", async () => {
    mockServer(STATUS_LOCKED);
    renderGate();
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cociboard" })).toBeInTheDocument();
    expect(screen.queryByText("the app")).not.toBeInTheDocument();
  });

  it("shows the app when the status can't be read (backend offline)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    renderGate();
    expect(await screen.findByText("the app")).toBeInTheDocument();
  });

  it("drops back to the login screen on an auth_required answer", async () => {
    const fetchMock = mockServer(STATUS_IN);
    renderGate();
    await screen.findByText("the app");
    fetchMock.mockImplementationOnce(() => json({ detail: { code: "auth_required" } }, 401));
    await expect(getHealth()).rejects.toMatchObject({ status: 401 });
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  });
});

describe("LoginScreen", () => {
  it("signs in and shows the app", async () => {
    const fetchMock = mockServer(STATUS_LOCKED);
    renderGate();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Password"), "open sesame");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("the app")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/auth/login");
    expect(call?.[1]?.body).toBe(JSON.stringify({ password: "open sesame" }));
  });

  it("explains a wrong password and keeps the form", async () => {
    mockServer(STATUS_LOCKED, () => json({ detail: { code: "invalid_password" } }, 401));
    renderGate();
    await userEvent.setup().type(await screen.findByLabelText("Password"), "nope{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("That password is not correct");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("tells how many minutes to wait when rate limited", async () => {
    mockServer(STATUS_LOCKED, () => json({ detail: { code: "too_many_attempts", retry_after: 125 } }, 429));
    renderGate();
    await userEvent.setup().type(await screen.findByLabelText("Password"), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 3 minutes.");
  });

  it("uses the singular for one minute", async () => {
    mockServer(STATUS_LOCKED, () => json({ detail: { code: "too_many_attempts", retry_after: 30 } }, 429));
    renderGate();
    await userEvent.setup().type(await screen.findByLabelText("Password"), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 1 minute.");
  });

  it("reports a network error", async () => {
    mockServer(STATUS_LOCKED, () => Promise.reject(new TypeError("Failed to fetch")));
    renderGate();
    await userEvent.setup().type(await screen.findByLabelText("Password"), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server");
  });

  it("toggles the password visibility with an accessible button", async () => {
    mockServer(STATUS_LOCKED);
    renderGate();
    const input = await screen.findByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    await userEvent.setup().click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("disables the submit button while signing in", async () => {
    let finish: (response: Response) => void = () => undefined;
    mockServer(
      STATUS_LOCKED,
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderGate();
    await userEvent.setup().type(await screen.findByLabelText("Password"), "x{Enter}");
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
    finish(new Response(null, { status: 204 }));
    expect(await screen.findByText("the app")).toBeInTheDocument();
  });
});

describe("LogoutButton", () => {
  it("logs out and returns to the login screen", async () => {
    mockServer(STATUS_IN);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <LogoutButton onError={() => undefined} />
        </AuthGate>
      </QueryClientProvider>,
    );
    await userEvent.setup().click(await screen.findByRole("button", { name: /Log out/ }));
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  });

  it("reports a failed logout and stays signed in", async () => {
    const fetchMock = mockServer(STATUS_IN);
    const onError = vi.fn();
    renderWithQuery(
      <AuthGate>
        <LogoutButton onError={onError} />
      </AuthGate>,
    );
    const button = await screen.findByRole("button", { name: /Log out/ });
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    await userEvent.setup().click(button);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("Couldn't log out")));
    expect(screen.getByRole("button", { name: /Log out/ })).toBeInTheDocument();
  });
});

describe("ExposureBanner", () => {
  it("is shown and remembers its dismissal for the session", async () => {
    const { unmount } = renderWithQuery(<ExposureBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Anyone who can reach this address");
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    renderWithQuery(<ExposureBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("still works when sessionStorage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderWithQuery(<ExposureBanner />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
