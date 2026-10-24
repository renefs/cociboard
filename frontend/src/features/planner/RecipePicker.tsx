import { useMemo, useState } from "react";
import type { MealSlot, Recipe } from "../../api/types";
import { RecipeCard } from "../recipes/RecipeCard";
import { useRecipes } from "../recipes/useRecipes";
import { Modal } from "./Modal";
import { filterRecipes } from "./slots";

interface RecipePickerProps {
  title: string;
  slot: MealSlot;
  onPick: (recipe: Recipe) => void;
  onClose: () => void;
}

/** Lists only the recipes that fit `slot`, with instant search. */
export function RecipePicker({ title, slot, onPick, onClose }: RecipePickerProps) {
  const [query, setQuery] = useState("");
  const { data, isPending, isError, refetch } = useRecipes({});
  const recipes = useMemo(() => filterRecipes(data ?? [], { slot, query }), [data, slot, query]);

  return (
    <Modal title={title} onClose={onClose} focusInput>
      <label className="search-field">
        <span className="visually-hidden">Search recipes</span>
        <input
          type="search"
          placeholder={`Search ${slot} recipes`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="picker-list" aria-live="polite">
        {isPending && <p className="status-message">Loading recipes…</p>}
        {isError && (
          <p className="status-message" role="alert">
            Could not load recipes.{" "}
            <button type="button" className="link-button" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        )}
        {data && recipes.length === 0 && (
          <p className="status-message">No {slot} recipes match.</p>
        )}
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            density="compact"
            actions={
              <button type="button" className="btn btn-primary" onClick={() => onPick(recipe)}>
                Choose <span className="visually-hidden">{recipe.name}</span>
              </button>
            }
          />
        ))}
      </div>
    </Modal>
  );
}
