import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { ShoppingList } from "../../api/types";
import { renderWithQuery } from "../../test/utils";
import { ShoppingListDialog } from "./ShoppingListDialog";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  getShoppingList: vi.fn(),
  setShoppingCheck: vi.fn(),
  uncheckShoppingList: vi.fn(),
  addShoppingExtra: vi.fn(),
  updateShoppingExtra: vi.fn(),
  deleteShoppingExtra: vi.fn(),
}));

const WEEK = "2026-10-26";
const meal = (day: number, id: number, name: string) => ({ day, slot: "lunch" as const, recipe_id: id, recipe_name: name });

function makeList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    week_start: WEEK,
    items: [
      { key: "aceite", name: "Aceite", checked: false, meals: [meal(0, 1, "Lentejas"), meal(1, 2, "Tortilla")] },
      { key: "huevos", name: "Huevos", checked: true, meals: [meal(1, 2, "Tortilla")] },
    ],
    extras: [{ id: 5, name: "Leche", checked: false }],
    ...overrides,
  };
}

/** The server state the mocked API reads and writes. */
let server: ShoppingList;
const onClose = vi.fn();
const onNotify = vi.fn();

beforeEach(() => {
  server = makeList();
  onClose.mockReset();
  onNotify.mockReset();
  vi.mocked(client.getShoppingList).mockImplementation(() => Promise.resolve(structuredClone(server)));
  vi.mocked(client.setShoppingCheck).mockImplementation((_week, key, checked) => {
    server = { ...server, items: server.items.map((i) => (i.key === key ? { ...i, checked } : i)) };
    return Promise.resolve(structuredClone(server));
  });
  vi.mocked(client.addShoppingExtra).mockImplementation((_week, name) => {
    server = { ...server, extras: [...server.extras, { id: 9, name, checked: false }] };
    return Promise.resolve(structuredClone(server));
  });
  vi.mocked(client.deleteShoppingExtra).mockImplementation((_week, id) => {
    server = { ...server, extras: server.extras.filter((e) => e.id !== id) };
    return Promise.resolve(structuredClone(server));
  });
  vi.mocked(client.uncheckShoppingList).mockImplementation(() => {
    server = {
      ...server,
      items: server.items.map((i) => ({ ...i, checked: false })),
      extras: server.extras.map((e) => ({ ...e, checked: false })),
    };
    return Promise.resolve(structuredClone(server));
  });
});

afterEach(() => vi.unstubAllGlobals());

function renderDialog() {
  return renderWithQuery(<ShoppingListDialog weekStart={WEEK} onClose={onClose} onNotify={onNotify} />);
}

describe("ShoppingListDialog", () => {
  it("shows the week, progress, items with their recipes and the basket", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: /Shopping list/ });
    expect(await within(dialog).findByText("1 of 3 bought")).toBeInTheDocument();
    const toBuy = within(dialog).getByRole("region", { name: /To buy/ });
    expect(within(toBuy).getByRole("checkbox", { name: /Aceite/ })).not.toBeChecked();
    expect(within(toBuy).getByText("Used in Lentejas, Tortilla")).toBeInTheDocument();
    expect(within(toBuy).getByText("in 2 meals")).toBeInTheDocument();
    expect(within(toBuy).getByText("Added by hand")).toBeInTheDocument();
    const basket = within(dialog).getByRole("region", { name: /In the basket/ });
    expect(within(basket).getByRole("checkbox", { name: /Huevos/ })).toBeChecked();
  });

  it("ticking an item moves it to the basket and calls the API", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("checkbox", { name: /Aceite/ }));
    expect(client.setShoppingCheck).toHaveBeenCalledWith(WEEK, "aceite", true);
    const basket = await screen.findByRole("region", { name: /In the basket/ });
    expect(within(basket).getByRole("checkbox", { name: /Aceite/ })).toBeChecked();
    expect(await screen.findByText("2 of 3 bought")).toBeInTheDocument();
  });

  it("adds an extra on submit, trimmed, and ignores empty input", async () => {
    const user = userEvent.setup();
    renderDialog();
    const input = await screen.findByLabelText("Add an item");
    await user.type(input, "   {Enter}");
    expect(client.addShoppingExtra).not.toHaveBeenCalled();
    await user.type(input, "  Pan  {Enter}");
    expect(client.addShoppingExtra).toHaveBeenCalledWith(WEEK, "Pan");
    expect(input).toHaveValue("");
    expect(await screen.findByRole("checkbox", { name: /Pan/ })).toBeInTheDocument();
  });

  it("deletes an extra", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Delete Leche" }));
    expect(client.deleteShoppingExtra).toHaveBeenCalledWith(WEEK, 5);
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: /Leche/ })).not.toBeInTheDocument());
  });

  it("unchecks everything, only offered when something is checked", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Uncheck all" }));
    expect(client.uncheckShoppingList).toHaveBeenCalledWith(WEEK);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Uncheck all" })).not.toBeInTheDocument());
  });

  it("copies the unchecked items to the clipboard and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    renderDialog();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(
      "Shopping list (26 Oct – 1 November 2026)\n\n- Aceite\n- Leche",
    );
    expect(onNotify).toHaveBeenCalledWith("info", "List copied.");
  });

  it("reports a clipboard failure", async () => {
    const user = userEvent.setup();
    renderDialog();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.reject(new Error("no")) } });
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    expect(onNotify).toHaveBeenCalledWith("error", "Couldn't copy the list.");
  });

  it("offers Share only when the browser supports it", async () => {
    renderDialog();
    await screen.findByRole("button", { name: "Copy" });
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("shares the text through the Web Share API", async () => {
    const user = userEvent.setup();
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share });
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("- Aceite") }));
  });

  it("shows the empty state when there are no meals and no extras", async () => {
    server = makeList({ items: [], extras: [] });
    renderDialog();
    expect(await screen.findByText("Add meals to the week to build the shopping list.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });

  it("rolls back and reports when an update fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.setShoppingCheck).mockRejectedValueOnce(new Error("boom"));
    renderDialog();
    await user.click(await screen.findByRole("checkbox", { name: /Aceite/ }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't update")));
    expect(await screen.findByRole("checkbox", { name: /Aceite/ })).not.toBeChecked();
  });
});
