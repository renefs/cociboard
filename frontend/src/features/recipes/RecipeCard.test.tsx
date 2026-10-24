import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeRecipe } from "../../test/fixtures";
import { RecipeCard } from "./RecipeCard";

describe("RecipeCard", () => {
  it("shows name, meal type, prep time and protein", () => {
    render(<RecipeCard recipe={makeRecipe()} />);
    expect(screen.getByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
    expect(screen.getByTestId("meal-type-badge")).toHaveTextContent("Lunch");
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText(/Main protein:/)).toBeInTheDocument();
    expect(screen.getByText("Legumes")).toBeInTheDocument();
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
