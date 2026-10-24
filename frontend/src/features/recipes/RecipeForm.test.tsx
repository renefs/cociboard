import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { RecipeForm } from "./RecipeForm";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}));

const onSaved = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onSaved.mockReset();
  onCancel.mockReset();
});

function renderForm(recipe?: ReturnType<typeof makeRecipe>) {
  renderWithQuery(<RecipeForm recipe={recipe} onSaved={onSaved} onCancel={onCancel} />);
}

const name = () => screen.getByRole("textbox", { name: /^Name/ });
const ingredient = (n: number) => screen.getByRole("textbox", { name: `Ingredient ${n}` });

describe("RecipeForm validation", () => {
  it("shows inline errors and does not call the API", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Create recipe" }));
    expect(screen.getByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one ingredient.")).toBeInTheDocument();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(name()).toHaveFocus();
    expect(client.createRecipe).not.toHaveBeenCalled();

    await user.type(name(), "x");
    expect(screen.queryByText("Enter a name.")).not.toBeInTheDocument();
  });

  it("rejects names over 80 characters and bad prep times", async () => {
    const user = userEvent.setup();
    renderForm();
    fireEvent.change(name(), { target: { value: "x".repeat(81) } });
    await user.type(ingredient(1), "Sal");
    await user.type(screen.getByRole("textbox", { name: /Prep time/ }), "0");
    await user.click(screen.getByRole("button", { name: "Create recipe" }));
    expect(screen.getByText("Use at most 80 characters.")).toBeInTheDocument();
    expect(screen.getByText("Prep time must be at least 1 minute.")).toBeInTheDocument();
    expect(client.createRecipe).not.toHaveBeenCalled();
  });
});

describe("RecipeForm create and edit", () => {
  it("creates a recipe with every field and disables submit while saving", async () => {
    const user = userEvent.setup();
    let finish: (recipe: ReturnType<typeof makeRecipe>) => void = () => undefined;
    vi.mocked(client.createRecipe).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();

    await user.type(name(), "  Gazpacho ");
    await user.click(screen.getByRole("radio", { name: /Dinner/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main protein" }), "fish");
    await user.type(screen.getByRole("textbox", { name: /Prep time/ }), "20");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Cold soup");
    await user.type(ingredient(1), "Tomate");
    await user.click(screen.getByRole("button", { name: /Add ingredient/ }));
    await user.type(ingredient(2), "Pepino");
    await user.click(screen.getByRole("button", { name: /Vegan/ }));
    await user.click(screen.getByRole("button", { name: "Create recipe" }));

    expect(client.createRecipe).toHaveBeenCalledWith({
      name: "Gazpacho",
      description: "Cold soup",
      meal_type: "dinner",
      protein: "fish",
      prep_minutes: 20,
      ingredients: ["Tomate", "Pepino"],
      properties: ["vegan"],
    });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    const saved = makeRecipe({ id: 9, name: "Gazpacho" });
    finish(saved);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ recipe: saved, created: true, removedMeals: 0 }));
  });

  it("prefills an existing recipe and sends a PATCH on save", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ id: 4, name: "Lentejas", description: "Hearty", prep_minutes: 60 });
    vi.mocked(client.updateRecipe).mockResolvedValue({ ...recipe, name: "Lentejas ricas" });
    renderForm(recipe);

    expect(name()).toHaveValue("Lentejas");
    expect(ingredient(1)).toHaveValue("Lentejas");
    expect(screen.getByRole("radio", { name: /Lunch/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /Gluten-free/ })).toHaveAttribute("aria-pressed", "true");

    await user.clear(name());
    await user.type(name(), "Lentejas ricas");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(client.updateRecipe).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ name: "Lentejas ricas", meal_type: "lunch", prep_minutes: 60 }),
      false,
    );
  });
});

describe("ingredient rows", () => {
  it("adds a row on Enter without submitting, and removes rows", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(ingredient(1), "Tomate{Enter}");
    expect(ingredient(2)).toHaveFocus();
    expect(client.createRecipe).not.toHaveBeenCalled();
    await user.type(ingredient(2), "Pepino");
    await user.click(screen.getByRole("button", { name: "Remove ingredient 1" }));
    expect(screen.queryByRole("textbox", { name: "Ingredient 2" })).not.toBeInTheDocument();
    expect(ingredient(1)).toHaveValue("Pepino");
  });

  it("splits pasted multi-line text into rows", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(ingredient(1));
    await user.paste("- Tomate\n- Pepino\n\n- Aceite");
    expect(ingredient(1)).toHaveValue("Tomate");
    expect(ingredient(2)).toHaveValue("Pepino");
    expect(ingredient(3)).toHaveValue("Aceite");
    expect(screen.queryByRole("textbox", { name: "Ingredient 4" })).not.toBeInTheDocument();
  });

  it("keeps a single-line paste in the row", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(ingredient(1));
    await user.paste("200 g lentejas");
    expect(ingredient(1)).toHaveValue("200 g lentejas");
  });
});

describe("server errors", () => {
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(name(), "Gazpacho");
    await user.type(ingredient(1), "Tomate");
    await user.click(screen.getByRole("button", { name: "Create recipe" }));
  }

  it("shows a duplicate name on the name field", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createRecipe).mockRejectedValue(
      new client.ApiError(409, "conflict", "A recipe named 'Gazpacho' already exists"),
    );
    renderForm();
    await fillAndSubmit(user);
    expect(await screen.findByText("Another recipe already has this name.")).toBeInTheDocument();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(name()).toHaveFocus();
    expect(screen.getByRole("button", { name: "Create recipe" })).toBeEnabled();
  });

  it("maps 422 errors to fields", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createRecipe).mockRejectedValue(
      new client.ApiError(422, "invalid", [
        { loc: ["body", "prep_minutes"], msg: "Input should be greater than 0" },
      ]),
    );
    renderForm();
    await fillAndSubmit(user);
    expect(await screen.findByText("Input should be greater than 0")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Prep time/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a general error when the server is unreachable", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createRecipe).mockRejectedValue(new TypeError("Failed to fetch"));
    renderForm();
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the recipe");
  });
});

describe("meal-type conflict", () => {
  it("lists the conflicting meals and saves with force after confirmation", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ id: 4, name: "Paella", meal_type: "both" });
    vi.mocked(client.updateRecipe)
      .mockRejectedValueOnce(
        new client.ApiError(409, "conflict", {
          code: "meal_type_conflict",
          message: "2 planned meals no longer fit the new meal type",
          conflicts: [
            { week_start: "2026-10-26", day: 1, slot: "dinner" },
            { week_start: "2026-11-02", day: 4, slot: "dinner" },
          ],
        }),
      )
      .mockResolvedValueOnce({ ...recipe, meal_type: "lunch" });
    renderForm(recipe);

    await user.click(screen.getByRole("radio", { name: /Lunch/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const panel = await screen.findByRole("alert");
    expect(within(panel).getByText("Tuesday dinner (week of 26 Oct)")).toBeInTheDocument();
    expect(within(panel).getByText("Friday dinner (week of 2 Nov)")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();

    await user.click(within(panel).getByRole("button", { name: "Remove them and save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(client.updateRecipe).toHaveBeenLastCalledWith(4, expect.objectContaining({ meal_type: "lunch" }), true);
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ created: false, removedMeals: 2 });
  });

  it("lets the user keep editing instead", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ id: 4, meal_type: "both" });
    vi.mocked(client.updateRecipe).mockRejectedValue(
      new client.ApiError(409, "conflict", {
        code: "meal_type_conflict",
        message: "m",
        conflicts: [{ week_start: "2026-10-26", day: 1, slot: "dinner" }],
      }),
    );
    renderForm(recipe);
    await user.click(screen.getByRole("radio", { name: /Lunch/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(await screen.findByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText(/no longer fit/)).not.toBeInTheDocument();
    expect(client.updateRecipe).toHaveBeenCalledTimes(1);
  });
});
