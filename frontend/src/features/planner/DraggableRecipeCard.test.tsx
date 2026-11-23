import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../test/fixtures";
import { DraggableRecipeCard } from "./DraggableRecipeCard";

function renderCard(props: Partial<Parameters<typeof DraggableRecipeCard>[0]> = {}) {
  const onAdd = vi.fn();
  render(
    <DndContext sensors={[]}>
      <DraggableRecipeCard recipe={makeRecipe({ name: "Lentil stew" })} selected={false} onAdd={onAdd} {...props} />
    </DndContext>,
  );
  return onAdd;
}

describe("DraggableRecipeCard", () => {
  it("has a round Add button with the full accessible name, and calls onAdd", async () => {
    const onAdd = renderCard();
    const add = screen.getByRole("button", { name: "Add Lentil stew to the plan" });
    expect(add).toHaveClass("round-button");
    expect(add).toHaveAttribute("aria-pressed", "false");
    expect(add).toHaveTextContent("Add Lentil stew to the plan");
    await userEvent.setup().click(add);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "Lentil stew" }));
  });

  it("turns the button into Cancel while the recipe is being placed", () => {
    renderCard({ selected: true });
    expect(screen.getByRole("button", { name: "Cancel Lentil stew to the plan" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the drag handle, with its name, and the favourite star", () => {
    renderCard({ onToggleFavourite: vi.fn() });
    expect(screen.getByRole("button", { name: "Drag Lentil stew. Press Space to pick up." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Lentil stew to favourites" })).toBeInTheDocument();
  });
});
