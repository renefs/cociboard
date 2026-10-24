import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  RECIPE_PROPERTIES,
  type MealSlot,
  type Protein,
  type RecipeProperty,
} from "../../api/types";
import { Legend } from "./Legend";
import type { Recipe } from "../../api/types";
import { sortByVariety } from "../variety/varietyLogic";
import { RecipeCard, type CardDensity } from "./RecipeCard";
import { RecipeDetailsModal, type Notify } from "./RecipeDetailsModal";
import { RecipeFormModal, savedMessage } from "./RecipeFormModal";
import { RecipeListSkeleton } from "./RecipeListSkeleton";
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
  renderCard?: (recipe: Recipe, open: (recipe: Recipe) => void) => ReactNode;
  /** Receives confirmations and errors (the planner shows them as toasts). */
  onNotify?: Notify;
  /**
   * How often each recipe is planned this week (recipe id -> count). Providing it enables
   * the "Best for variety" sort, together with `proteinCounts`.
   */
  usage?: ReadonlyMap<number, number>;
  proteinCounts?: Partial<Record<Protein, number>>;
}

type SortMode = "name" | "variety";

export function RecipePanel({
  density = "comfortable",
  renderCard,
  usage,
  proteinCounts,
  onNotify,
}: RecipePanelProps = {}) {
  const [search, setSearch] = useState("");
  const [meal, setMeal] = useState<MealFilter>("all");
  const [properties, setProperties] = useState<RecipeProperty[]>([]);
  const [sort, setSort] = useState<SortMode>("name");
  const [dialog, setDialog] = useState<
    { kind: "none" } | { kind: "new" } | { kind: "details"; recipe: Recipe }
  >({ kind: "none" });
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data, isPending, isError, refetch } = useRecipes({
    slot: meal === "all" ? undefined : meal,
    q,
    properties,
  });

  const recipes = useMemo(
    () =>
      data && usage && sort === "variety" ? sortByVariety(data, usage, proteinCounts ?? {}) : data,
    [data, usage, proteinCounts, sort],
  );

  const filtersActive = search.trim() !== "" || meal !== "all" || properties.length > 0;
  const clearFilters = () => {
    setSearch("");
    setMeal("all");
    setProperties([]);
  };
  const openDetails = (recipe: Recipe) => setDialog({ kind: "details", recipe });
  const closeDialog = () => setDialog({ kind: "none" });

  const toggleProperty = (property: RecipeProperty) =>
    setProperties((current) =>
      current.includes(property) ? current.filter((p) => p !== property) : [...current, property],
    );

  return (
    <section
      className={density === "compact" ? "recipe-panel recipe-panel--compact" : "recipe-panel"}
      aria-labelledby="recipes-heading">
      <div className="panel-head">
        <h2 id="recipes-heading">Recipes</h2>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "new" })}>
          <span aria-hidden="true">+ </span>New recipe
        </button>
      </div>

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

        {usage && (
          <div className="chip-group" role="group" aria-label="Sort recipes">
            <button
              type="button"
              className="chip"
              aria-pressed={sort === "name"}
              onClick={() => setSort("name")}
            >
              A–Z
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={sort === "variety"}
              onClick={() => setSort("variety")}
              title="Recipes you haven't planned yet and proteins you've used least come first"
            >
              Best for variety
            </button>
          </div>
        )}

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

      <div className="recipe-list" aria-live="polite" aria-busy={isPending}>
        {isPending && (
          <>
            <p className="visually-hidden">Loading recipes…</p>
            <RecipeListSkeleton />
          </>
        )}
        {isError && (
          <div className="state-box" role="alert">
            <p>Can&apos;t load the recipes. Check that the server is running and your connection.</p>
            <button type="button" className="btn" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        )}
        {recipes && recipes.length === 0 && filtersActive && (
          <div className="state-box">
            <p>No recipes match your search or filters.</p>
            <button type="button" className="btn" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
        {recipes && recipes.length === 0 && !filtersActive && (
          <div className="state-box">
            <p>Your recipe catalogue is empty.</p>
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "new" })}>
              Add your first recipe
            </button>
          </div>
        )}
        {recipes?.map((recipe) =>
          renderCard ? (
            <div key={recipe.id}>{renderCard(recipe, openDetails)}</div>
          ) : (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              density={density}
              usageCount={usage?.get(recipe.id) ?? 0}
              onOpen={openDetails}
            />
          ),
        )}
      </div>

      <Legend />

      {dialog.kind === "new" && (
        <RecipeFormModal
          onClose={closeDialog}
          onSaved={(info) => {
            closeDialog();
            onNotify?.("info", savedMessage(info));
          }}
        />
      )}
      {dialog.kind === "details" && (
        <RecipeDetailsModal recipe={dialog.recipe} onClose={closeDialog} onNotify={onNotify} />
      )}
    </section>
  );
}
