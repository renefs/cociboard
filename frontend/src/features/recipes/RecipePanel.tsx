import { useEffect, useState, type ReactNode } from "react";
import { RECIPE_PROPERTIES, type MealSlot, type RecipeProperty } from "../../api/types";
import { Legend } from "./Legend";
import type { Recipe } from "../../api/types";
import { RecipeCard, type CardDensity } from "./RecipeCard";
import { PROPERTY_META } from "./recipeMeta";
import { useRecipes } from "./useRecipes";

type MealFilter = MealSlot | "all";

const MEAL_FILTERS: { value: MealFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const SEARCH_DEBOUNCE_MS = 200;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface RecipePanelProps {
  density?: CardDensity;
  /** Custom card rendering (the planner adds drag handles and an "Add" button). */
  renderCard?: (recipe: Recipe) => ReactNode;
}

export function RecipePanel({ density = "comfortable", renderCard }: RecipePanelProps = {}) {
  const [search, setSearch] = useState("");
  const [meal, setMeal] = useState<MealFilter>("all");
  const [properties, setProperties] = useState<RecipeProperty[]>([]);
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data, isPending, isError, refetch } = useRecipes({
    slot: meal === "all" ? undefined : meal,
    q,
    properties,
  });

  const toggleProperty = (property: RecipeProperty) =>
    setProperties((current) =>
      current.includes(property) ? current.filter((p) => p !== property) : [...current, property],
    );

  return (
    <section
      className={density === "compact" ? "recipe-panel recipe-panel--compact" : "recipe-panel"}
      aria-labelledby="recipes-heading">
      <h2 id="recipes-heading">Recipes</h2>

      <div className="recipe-controls">
        <label className="search-field">
          <span className="visually-hidden">Search recipes</span>
          <input
            type="search"
            placeholder="Search by name or ingredient"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="chip-group" role="group" aria-label="Meal type">
          {MEAL_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={meal === value}
              onClick={() => setMeal(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <details className="property-filter">
          <summary>
            Properties{properties.length > 0 ? ` (${properties.length} selected)` : ""}
          </summary>
          <div className="chip-group" role="group" aria-label="Filter by property">
            {RECIPE_PROPERTIES.map((property) => {
              const meta = PROPERTY_META[property];
              return (
                <button
                  key={property}
                  type="button"
                  className="chip"
                  aria-pressed={properties.includes(property)}
                  onClick={() => toggleProperty(property)}
                >
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <div className="recipe-list" aria-live="polite">
        {isPending && <p className="status-message">Loading recipes…</p>}
        {isError && (
          <p className="status-message" role="alert">
            Could not load recipes.{" "}
            <button type="button" className="link-button" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        )}
        {data && data.length === 0 && <p className="status-message">No recipes match.</p>}
        {data && data.map((recipe) =>
            renderCard ? (
              <div key={recipe.id}>{renderCard(recipe)}</div>
            ) : (
              <RecipeCard key={recipe.id} recipe={recipe} density={density} />
            ),
          )}
      </div>

      <Legend />
    </section>
  );
}
