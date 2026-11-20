import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { Pantry, ShoppingList } from "../../api/types";
import { ingredientKey } from "./pantryLogic";
import { renderWithQuery } from "../../test/utils";
import { ShoppingListDialog } from "./ShoppingListDialog";
import { PANTRY_CHANGE_KEY } from "../../offline/keys";
import { pendingVariables } from "../../offline/pending";
import { applyShoppingOverlay, type PantryChange } from "./shoppingChanges";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  getShoppingList: vi.fn(),
  setShoppingCheck: vi.fn(),
  uncheckShoppingList: vi.fn(),
  addShoppingExtra: vi.fn(),
  updateShoppingExtra: vi.fn(),
  deleteShoppingExtra: vi.fn(),
  getPantry: vi.fn(),
  addToPantry: vi.fn(),
  removeFromPantry: vi.fn(),
}));

const WEEK = "2026-10-26";
const meal = (day: number, id: number, name: string) => ({ day, slot: "lunch" as const, recipe_id: id, recipe_name: name });

function makeList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    week_start: WEEK,
    items: [
      { key: "aceite", name: "Aceite", checked: false, in_pantry: false, meals: [meal(0, 1, "Lentejas"), meal(1, 2, "Tortilla")] },
      { key: "huevos", name: "Huevos", checked: true, in_pantry: false, meals: [meal(1, 2, "Tortilla")] },
    ],
    extras: [{ id: 5, name: "Leche", checked: false }],
    ...overrides,
  };
}

/** The server state the mocked API reads and writes. */
let server: ShoppingList;
let pantry: Pantry;
let nextPantryId: number;
const onClose = vi.fn();
const onNotify = vi.fn();

beforeEach(() => {
  server = makeList();
  pantry = { items: [], suggestions: [] };
  nextPantryId = 40;
  vi.mocked(client.getPantry).mockImplementation(() => Promise.resolve(structuredClone(pantry)));
  vi.mocked(client.addToPantry).mockImplementation((name) => {
    const key = ingredientKey(name);
    let item = pantry.items.find((i) => i.key === key);
    if (!item) {
      item = { id: nextPantryId++, key, name };
      pantry = {
        items: [...pantry.items, item],
        suggestions: pantry.suggestions.filter((suggestion) => suggestion.key !== key),
      };
    }
    server = { ...server, items: server.items.map((i) => (i.key === key ? { ...i, in_pantry: true } : i)) };
    return Promise.resolve(structuredClone(item));
  });
  vi.mocked(client.removeFromPantry).mockImplementation((id) => {
    const gone = pantry.items.find((i) => i.id === id);
    pantry = { ...pantry, items: pantry.items.filter((i) => i.id !== id) };
    server = { ...server, items: server.items.map((i) => (i.key === gone?.key ? { ...i, in_pantry: false } : i)) };
    return Promise.resolve();
  });
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

afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelector(".print-root")?.remove();
});

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
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("info", "Shopping list copied."));
  });

  it("shows the text to select by hand when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    renderDialog();
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    const area = await screen.findByRole("textbox", { name: "Text to copy" });
    expect((area as HTMLTextAreaElement).value).toBe("Shopping list (26 Oct – 1 November 2026)\n\n- Aceite\n- Leche");
    expect(screen.getByText("Select the text and copy it.")).toBeInTheDocument();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("prints the items to buy with empty boxes, then the bought ones", async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    window.print = print;
    server = makeList({
      items: [...makeList().items, { key: "sal", name: "Sal", checked: false, in_pantry: true, meals: [] }],
    });
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.querySelector<HTMLElement>("body > .print-root");
    expect(root).toHaveTextContent("Shopping list · 26 Oct – 1 November 2026");
    const toBuy = root?.querySelectorAll(".print-checklist li");
    expect(Array.from(toBuy ?? []).map((li) => li.textContent)).toEqual(["Aceite", "Leche"]);
    expect(root?.querySelectorAll(".print-checklist .print-box[aria-hidden='true']")).toHaveLength(2);
    expect(root?.querySelector(".print-secondary")).toHaveTextContent("Already bought");
    expect(root).toHaveTextContent("Huevos");
    expect(root).toHaveTextContent("In the pantry");
    expect(root).toHaveTextContent("Sal");
    window.dispatchEvent(new Event("afterprint"));
    await waitFor(() => expect(root).toBeEmptyDOMElement());
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
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
  });

  it("rolls back and reports when an update fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.setShoppingCheck).mockRejectedValueOnce(new Error("boom"));
    renderDialog();
    await user.click(await screen.findByRole("checkbox", { name: /Aceite/ }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't update")));
    expect(await screen.findByRole("checkbox", { name: /Aceite/ })).not.toBeChecked();
  });
  describe("pantry", () => {
    function pantryAt(key: string, name: string, id = 3) {
      pantry = { ...pantry, items: [...pantry.items, { id, key, name }] };
      server = { ...server, items: server.items.map((i) => (i.key === key ? { ...i, in_pantry: true } : i)) };
    }

    it("moves an item to the pantry at once, announces it and focuses the next row", async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.click(await screen.findByRole("button", { name: "Mark Aceite as always at home" }));
      expect(client.addToPantry).toHaveBeenCalledWith("Aceite");
      const toBuy = screen.getByRole("region", { name: /To buy/ });
      expect(within(toBuy).queryByRole("checkbox", { name: /Aceite/ })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Aceite is in the pantry and won't be listed to buy.");
      expect(within(toBuy).getByRole("checkbox", { name: /Leche/ })).toHaveFocus();
      expect(await screen.findByText("In the pantry (1)")).toBeInTheDocument();
      expect(screen.getByText("1 of 2 bought")).toBeInTheDocument();
    });

    it("focuses the to-buy heading when the last row leaves", async () => {
      const user = userEvent.setup();
      server = makeList({ extras: [] });
      renderDialog();
      await user.click(await screen.findByRole("button", { name: "Mark Aceite as always at home" }));
      expect(screen.getByRole("heading", { name: /To buy/ })).toHaveFocus();
      expect(await screen.findByText("Everything is in the basket.")).toBeInTheDocument();
    });

    it("offers the action on generated items only, not on extras", async () => {
      renderDialog();
      await screen.findByRole("checkbox", { name: /Leche/ });
      expect(screen.getAllByRole("button", { name: /as always at home/ })).toHaveLength(2);
      expect(screen.queryByRole("button", { name: /Leche as always/ })).not.toBeInTheDocument();
    });

    it("lists pantry items apart, ignores them in progress and says when nothing is left", async () => {
      server = makeList({ extras: [] });
      pantryAt("aceite", "Aceite");
      server = { ...server, items: server.items.map((i) => (i.key === "huevos" ? { ...i, in_pantry: true } : i)) };
      renderDialog();
      expect(await screen.findByText("In the pantry (2)")).toBeInTheDocument();
      expect(screen.getByText("0 of 0 bought")).toBeInTheDocument();
      expect(screen.getByText("Nothing to buy: everything is in the pantry.")).toBeInTheDocument();
      expect(screen.getByText("You usually have these at home. Check you're not running low.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /In the basket/ })).not.toBeInTheDocument();
    });

    it("brings an item back with Need to buy, announces it and focuses the heading", async () => {
      const user = userEvent.setup();
      pantryAt("aceite", "Aceite", 7);
      renderDialog();
      await user.click(await screen.findByRole("button", { name: "Need to buy Aceite" }));
      expect(client.removeFromPantry).toHaveBeenCalledWith(7);
      expect(screen.getByRole("status")).toHaveTextContent("Aceite is no longer in the pantry and is listed to buy again.");
      const toBuy = screen.getByRole("region", { name: /To buy/ });
      expect(await within(toBuy).findByRole("checkbox", { name: /Aceite/ })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /To buy/ })).toHaveFocus();
      expect(screen.queryByText(/In the pantry \(/)).not.toBeInTheDocument();
    });

    it("keeps pantry items out of the copied text but names them", async () => {
      const user = userEvent.setup();
      pantryAt("aceite", "Aceite");
      const writeText = vi.fn(() => Promise.resolve());
      renderDialog();
      await screen.findByText("In the pantry (1)");
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
      await user.click(screen.getByRole("button", { name: "Copy" }));
      expect(writeText).toHaveBeenCalledWith(
        "Shopping list (26 Oct – 1 November 2026)\n\n- Leche\n\nAlso check at home: Aceite",
      );
    });

    it("rolls back and reports when the pantry update fails", async () => {
      const user = userEvent.setup();
      vi.mocked(client.addToPantry).mockRejectedValueOnce(new Error("boom"));
      renderDialog();
      await user.click(await screen.findByRole("button", { name: "Mark Aceite as always at home" }));
      await waitFor(() => expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't update the pantry")));
      const toBuy = screen.getByRole("region", { name: /To buy/ });
      expect(await within(toBuy).findByRole("checkbox", { name: /Aceite/ })).toBeInTheDocument();
      expect(screen.queryByText(/In the pantry \(/)).not.toBeInTheDocument();
    });

    it("shows a pantry change on every cached week at once (overlay) and refetches when settled", async () => {
      const user = userEvent.setup();
      const { queryClient } = renderDialog();
      const otherWeek = { ...makeList(), week_start: "2026-11-02" };
      queryClient.setQueryData(["shopping", "2026-11-02"], otherWeek);
      let release: () => void = () => undefined;
      vi.mocked(client.addToPantry).mockImplementationOnce(
        (name) =>
          new Promise((resolve) => {
            release = () => resolve({ id: 11, key: ingredientKey(name), name });
          }),
      );
      await user.click(await screen.findByRole("button", { name: "Mark Aceite as always at home" }));
      const shown = applyShoppingOverlay(otherWeek, [], pendingVariables<PantryChange>(queryClient, [PANTRY_CHANGE_KEY]));
      expect(shown.items.find((i) => i.key === "aceite")?.in_pantry).toBe(true);
      release();
      // Once saved, the change is part of what the cache holds.
      await waitFor(() =>
        expect(
          queryClient.getQueryData<ShoppingList>(["shopping", "2026-11-02"])?.items.find((i) => i.key === "aceite")
            ?.in_pantry,
        ).toBe(true),
      );
      await waitFor(() => expect(client.getPantry).toHaveBeenCalledTimes(2));
    });
  });

  describe("manage pantry", () => {
    async function openPanel() {
      const user = userEvent.setup();
      renderDialog();
      await user.click(await screen.findByText("Manage pantry"));
      return user;
    }

    it("shows the empty state", async () => {
      await openPanel();
      expect(await screen.findByText(/Nothing in the pantry yet/)).toBeInTheDocument();
    });

    it("adds any ingredient by name, trimmed, and clears the input", async () => {
      const user = await openPanel();
      const input = await screen.findByLabelText("Add to the pantry");
      await user.type(input, "   {Enter}");
      expect(client.addToPantry).not.toHaveBeenCalled();
      await user.type(input, "  Aceite de  oliva {Enter}");
      expect(client.addToPantry).toHaveBeenCalledWith("Aceite de oliva");
      expect(input).toHaveValue("");
      expect(await screen.findByRole("button", { name: "Remove Aceite de oliva from the pantry" })).toBeInTheDocument();
    });

    it("adds a suggestion with one tap and removes a staple", async () => {
      pantry = { items: [{ id: 3, key: "sal", name: "Sal" }], suggestions: [{ key: "ajo", name: "Ajo", recipe_count: 18 }] };
      const user = await openPanel();
      await user.click(await screen.findByRole("button", { name: "Add Ajo (used in 18 recipes)" }));
      expect(client.addToPantry).toHaveBeenCalledWith("Ajo");
      await waitFor(() => expect(screen.queryByRole("button", { name: /^Add Ajo/ })).not.toBeInTheDocument());
      await user.click(await screen.findByRole("button", { name: "Remove Sal from the pantry" }));
      expect(client.removeFromPantry).toHaveBeenCalledWith(3);
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Remove Sal from the pantry" })).not.toBeInTheDocument(),
      );
    });

    it("removing a staple puts a matching item back in the list to buy", async () => {
      pantry = { items: [{ id: 3, key: "aceite", name: "Aceite" }], suggestions: [] };
      server = { ...server, items: server.items.map((i) => (i.key === "aceite" ? { ...i, in_pantry: true } : i)) };
      const user = await openPanel();
      await user.click(await screen.findByRole("button", { name: "Remove Aceite from the pantry" }));
      const toBuy = screen.getByRole("region", { name: /To buy/ });
      expect(await within(toBuy).findByRole("checkbox", { name: /Aceite/ })).toBeInTheDocument();
    });

    it("reports a failed add and drops the optimistic item", async () => {
      vi.mocked(client.addToPantry).mockRejectedValueOnce(new Error("boom"));
      const user = await openPanel();
      await user.type(await screen.findByLabelText("Add to the pantry"), "Sal{Enter}");
      await waitFor(() => expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't update the pantry")));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Sal from the pantry" })).not.toBeInTheDocument());
    });
  });
});
