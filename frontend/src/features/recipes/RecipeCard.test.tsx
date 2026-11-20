import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../test/fixtures";
import { RecipeCard } from "./RecipeCard";

describe("RecipeCard", () => {
  it("shows name, meal type, prep time and protein", () => {
    render(<RecipeCard recipe={makeRecipe()} />);
    expect(screen.getByRole("heading", { name: "Lentejas estofadas" })).toBeInTheDocument();
    expect(screen.getByTestId("meal-type-badge")).toHaveTextContent("Lunch");
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText(/Main protein:/)).toBeInTheDocument();
    expect(screen.getByText("Legumes")).toBeInTheDocument();
  });

  it("shows servings in the meta row with an accessible label, in both densities", () => {
    for (const density of ["comfortable", "compact"] as const) {
      const { unmount } = render(<RecipeCard recipe={makeRecipe({ servings: 4 })} density={density} />);
      const fact = screen.getByRole("img", { name: "Serves 4" });
      expect(fact).toHaveTextContent("4");
      unmount();
    }
    render(<RecipeCard recipe={makeRecipe({ servings: 1 })} />);
    expect(screen.getByRole("img", { name: "Serves 1" })).toBeInTheDocument();
  });

  it("shows no servings indicator, and never the steps, on the card", () => {
    render(<RecipeCard recipe={makeRecipe({ steps: ["Secret step"] })} />);
    expect(screen.queryByRole("img", { name: /Serves/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Secret step")).not.toBeInTheDocument();
  });

  it("renders property icons with accessible labels", () => {
    render(<RecipeCard recipe={makeRecipe()} />);
    const properties = screen.getByRole("list", { name: "Properties" });
    const gluten = within(properties).getByRole("img", { name: "Gluten-free" });
    expect(gluten).toHaveAttribute("title", "Gluten-free");
    expect(within(properties).getByRole("img", { name: "Batch cooking" })).toBeInTheDocument();
  });

  it("collapses long ingredient lists and expands on demand", async () => {
    const user = userEvent.setup();
    render(<RecipeCard recipe={makeRecipe()} />);
    const list = screen.getByRole("list", { name: "Ingredients" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).queryByText("Laurel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+2 more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByText("Laurel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("has no expander when ingredients fit", () => {
    render(<RecipeCard recipe={makeRecipe({ ingredients: ["Huevos", "Patatas"] })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("omits prep time and property list when absent", () => {
    render(<RecipeCard recipe={makeRecipe({ prep_minutes: null, properties: [] })} />);
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Properties" })).not.toBeInTheDocument();
  });
});

describe("RecipeCard compact density", () => {
  it("shows a one-line comma-separated ingredient summary with the full list on expand", async () => {
    const user = userEvent.setup();
    render(<RecipeCard recipe={makeRecipe()} density="compact" />);
    const summary = screen.getByText(/Lentejas, Chorizo, Zanahoria/);
    expect(summary).toHaveTextContent("Lentejas, Chorizo, Zanahoria, Cebolla, Laurel, Aceite");
    expect(summary).toHaveAttribute("title", "Lentejas, Chorizo, Zanahoria, Cebolla, Laurel, Aceite");
    expect(summary).not.toHaveClass("is-expanded");
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(summary).toHaveClass("is-expanded");
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps meal type, protein and property icons visible and renders actions", () => {
    render(<RecipeCard recipe={makeRecipe()} density="compact" actions={<button>Add</button>} />);
    expect(screen.getByTestId("meal-type-badge")).toHaveTextContent("Lunch");
    expect(screen.getByText("Legumes")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gluten-free" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("has no expander for a short ingredient list", () => {
    render(<RecipeCard recipe={makeRecipe({ ingredients: ["Huevos", "Patatas"] })} density="compact" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("RecipeCard favourites and history", () => {
  it("has a star button that reports the change and has an accessible name per state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<RecipeCard recipe={makeRecipe()} onToggleFavourite={onToggle} />);
    const star = screen.getByRole("button", { name: "Add Lentejas estofadas to favourites" });
    expect(star).toHaveAttribute("aria-pressed", "false");

    await user.click(star);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true);

    rerender(<RecipeCard recipe={makeRecipe({ favourite: true })} onToggleFavourite={onToggle} />);
    const pressed = screen.getByRole("button", { name: "Remove Lentejas estofadas from favourites" });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    await user.click(pressed);
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }), false);
  });

  it("works in both densities", () => {
    for (const density of ["comfortable", "compact"] as const) {
      const { unmount } = render(<RecipeCard recipe={makeRecipe()} density={density} onToggleFavourite={vi.fn()} />);
      expect(screen.getAllByRole("button", { name: /to favourites/ })).toHaveLength(1);
      unmount();
    }
  });

  it("keeps a press on the star away from the drag listeners of the card", () => {
    const onPointerDown = vi.fn();
    const onTouchStart = vi.fn();
    const onClick = vi.fn();
    render(
      <div onPointerDown={onPointerDown} onTouchStart={onTouchStart} onClick={onClick}>
        <RecipeCard recipe={makeRecipe()} onToggleFavourite={vi.fn()} />
      </div>,
    );
    const star = screen.getByRole("button", { name: /to favourites/ });

    fireEvent.pointerDown(star);
    fireEvent.touchStart(star);
    fireEvent.click(star);

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onTouchStart).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a plain labelled star, not a button, for a favourite without a toggle", () => {
    render(<RecipeCard recipe={makeRecipe({ favourite: true })} density="compact" />);
    expect(screen.getByRole("img", { name: "Favourite" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /favourites/ })).not.toBeInTheDocument();
  });

  it("shows nothing for a non-favourite without a toggle", () => {
    render(<RecipeCard recipe={makeRecipe()} density="compact" />);
    expect(screen.queryByRole("img", { name: "Favourite" })).not.toBeInTheDocument();
  });

  it("shows when the recipe was last made, only when asked to", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    try {
      const recipe = makeRecipe({ last_planned_on: "2026-10-30" });
      const { rerender } = render(<RecipeCard recipe={recipe} density="compact" />);
      expect(screen.queryByText(/Last made/)).not.toBeInTheDocument();

      rerender(<RecipeCard recipe={recipe} density="compact" showHistory />);
      expect(screen.getByText("Last made 3 weeks ago")).toBeInTheDocument();

      rerender(<RecipeCard recipe={makeRecipe()} showHistory />);
      expect(screen.getByText("Never planned")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
