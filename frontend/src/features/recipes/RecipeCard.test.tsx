import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../test/fixtures";
import { RecipeCard } from "./RecipeCard";

describe("RecipeCard", () => {
  it("shows the name, the protein with its dot, and the prep time", () => {
    const { container } = render(<RecipeCard recipe={makeRecipe()} />);
    expect(screen.getByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText(/Main protein:/)).toBeInTheDocument();
    expect(screen.getByText("Legumes")).toBeInTheDocument();
    expect(container.querySelector(".protein-dot")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the short protein label in the row", () => {
    render(<RecipeCard recipe={makeRecipe({ protein: "none" })} />);
    expect(screen.getByText("No protein")).toBeInTheDocument();
    expect(screen.queryByText("No main protein")).not.toBeInTheDocument();
  });

  it("names the meal type only when it is not 'both'", () => {
    const { rerender } = render(<RecipeCard recipe={makeRecipe({ meal_type: "both" })} />);
    expect(screen.queryByText(/only$/)).not.toBeInTheDocument();
    rerender(<RecipeCard recipe={makeRecipe({ meal_type: "lunch" })} />);
    expect(screen.getByText("Lunch only")).toBeInTheDocument();
    rerender(<RecipeCard recipe={makeRecipe({ meal_type: "dinner" })} />);
    expect(screen.getByText("Dinner only")).toBeInTheDocument();
  });

  it("leaves servings, properties, ingredients and steps to the details", () => {
    render(<RecipeCard recipe={makeRecipe({ servings: 4, steps: ["Secret step"] })} />);
    expect(screen.queryByRole("img", { name: /Serves/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Gluten-free" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/Lentejas/)).not.toBeInTheDocument();
    expect(screen.queryByText("Secret step")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("omits the prep time when absent", () => {
    render(<RecipeCard recipe={makeRecipe({ prep_minutes: null })} />);
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
  });

  it("renders the actions and the name button that opens the details", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<RecipeCard recipe={makeRecipe()} onOpen={onOpen} actions={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fabada asturiana" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("shows the good-pick tag, the highlight and the extra line when given", () => {
    const { container } = render(
      <RecipeCard recipe={makeRecipe()} highlight nameTag={<span>Tag</span>} extra={<p>Because</p>} />,
    );
    expect(screen.getByText("Tag")).toBeInTheDocument();
    expect(screen.getByText("Because")).toBeInTheDocument();
    expect(container.querySelector(".recipe-card--good")).not.toBeNull();
  });
});

describe("RecipeCard usage and history line", () => {
  const recipe = makeRecipe({ last_planned_on: "2026-10-30" });

  it("shows how often the recipe is planned this week as plain text, instead of the history", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    try {
      const { container } = render(<RecipeCard recipe={recipe} usageCount={2} showHistory />);
      expect(screen.getByText("×2 this week")).toBeInTheDocument();
      expect(screen.getByText("Planned 2 times this week")).toBeInTheDocument();
      expect(container.querySelector(".badge")).toBeNull();
      expect(screen.queryByText(/Last made/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the history when the recipe is not used this week", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    try {
      render(<RecipeCard recipe={recipe} usageCount={0} showHistory />);
      expect(screen.getByText("Last made 3 weeks ago")).toBeInTheDocument();
      expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows neither without usage and without showHistory", () => {
    render(<RecipeCard recipe={recipe} />);
    expect(screen.queryByText(/Last made|this week|Never planned/)).not.toBeInTheDocument();
  });
});

describe("RecipeCard favourites and history", () => {
  it("has a star button that reports the change and has an accessible name per state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<RecipeCard recipe={makeRecipe()} onToggleFavourite={onToggle} />);
    const star = screen.getByRole("button", { name: "Add Fabada asturiana to favourites" });
    expect(star).toHaveAttribute("aria-pressed", "false");

    await user.click(star);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true);

    rerender(<RecipeCard recipe={makeRecipe({ favourite: true })} onToggleFavourite={onToggle} />);
    const pressed = screen.getByRole("button", { name: "Remove Fabada asturiana from favourites" });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    await user.click(pressed);
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }), false);
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
    render(<RecipeCard recipe={makeRecipe({ favourite: true })} />);
    expect(screen.getByRole("img", { name: "Favourite" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /favourites/ })).not.toBeInTheDocument();
  });

  it("shows nothing for a non-favourite without a toggle", () => {
    render(<RecipeCard recipe={makeRecipe()} />);
    expect(screen.queryByRole("img", { name: "Favourite" })).not.toBeInTheDocument();
  });

  it("shows when the recipe was last made, only when asked to", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    try {
      const recipe = makeRecipe({ last_planned_on: "2026-10-30" });
      const { rerender } = render(<RecipeCard recipe={recipe} />);
      expect(screen.queryByText(/Last made/)).not.toBeInTheDocument();

      rerender(<RecipeCard recipe={recipe} showHistory />);
      expect(screen.getByText("Last made 3 weeks ago")).toBeInTheDocument();

      rerender(<RecipeCard recipe={makeRecipe()} showHistory />);
      expect(screen.getByText("Never planned")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
