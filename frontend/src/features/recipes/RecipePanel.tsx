import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  RECIPE_PROPERTIES,
  type MealSlot,
  type Protein,
  type RecipeProperty,
} from "../../api/types";
import { Legend } from "./Legend";
import type { Recipe } from "../../api/types";
import { sortByVariety } from "../variety/varietyLogic";
import { sortByNotMadeLately } from "./historyLogic";
import { RecipeCard, type CardDensity } from "./RecipeCard";
import { RecipeDetailsModal, type Notify } from "./RecipeDetailsModal";
import { RecipeFormModal, savedMessage } from "./RecipeFormModal";
import { useSharedLink } from "./useSharedLink";
import { RecipeListSkeleton } from "./RecipeListSkeleton";
import { ArchivedRow } from "./ArchivedRow";
import { PROPERTY_META } from "./recipeMeta";
import { useRecipes } from "./useRecipes";
import { useToggleFavourite } from "./useRecipeMutations";

type MealFilter = MealSlot | "all";

const MEAL_FILTERS: MealFilter[] = ["all", "lunch", "dinner"];

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
  renderCard?: (
    recipe: Recipe,
    open: (recipe: Recipe) => void,
    toggleFavourite: (recipe: Pick<Recipe, "id" | "name">, favourite: boolean) => void,
  ) => ReactNode;
  /** Receives confirmations and errors (the planner shows them as toasts). */
  onNotify?: Notify;
  /**
   * How often each recipe is planned this week (recipe id -> count). Providing it enables
   * the "Best for variety" sort, together with `proteinCounts`.
   */
  usage?: ReadonlyMap<number, number>;
  proteinCounts?: Partial<Record<Protein, number>>;
}

type SortMode = "name" | "variety" | "lately";

export function RecipePanel({
  density = "comfortable",
  renderCard,
  usage,
  proteinCounts,
  onNotify,
}: RecipePanelProps = {}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [meal, setMeal] = useState<MealFilter>("all");
  const [properties, setProperties] = useState<RecipeProperty[]>([]);
  const [sort, setSort] = useState<SortMode>("name");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  // A link shared from another app (Android share sheet) opens the form and starts the import.
  const sharedLink = useSharedLink();
  const [dialog, setDialog] = useState<
    { kind: "none" } | { kind: "new"; importUrl?: string } | { kind: "details"; recipe: Recipe }
  >(() => (sharedLink ? { kind: "new", importUrl: sharedLink } : { kind: "none" }));
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const filters = {
    slot: meal === "all" ? undefined : meal,
    q,
    properties,
    favourite: favouritesOnly,
  };
  const { data, isPending, isError, refetch } = useRecipes(filters);
  // The count ignores the filters; the list below the toggle follows them.
  const archivedCount = useRecipes({ archived: true }).data?.length ?? 0;
  const [showArchived, setShowArchived] = useState(false);
  const archivedList = useRecipes({ ...filters, favourite: false, archived: true }, showArchived);

  const recipes = useMemo(() => {
    if (!data) return data;
    if (sort === "lately") return sortByNotMadeLately(data);
    return usage && sort === "variety" ? sortByVariety(data, usage, proteinCounts ?? {}) : data;
  }, [data, usage, proteinCounts, sort]);

  // Archived recipes follow the other filters but not the favourites one: they are a separate list.
  const otherFiltersActive = search.trim() !== "" || meal !== "all" || properties.length > 0;
  const filtersActive = otherFiltersActive || favouritesOnly;
  const clearFilters = () => {
    setSearch("");
    setMeal("all");
    setProperties([]);
    setFavouritesOnly(false);
  };
  const toggleFavourite = useToggleFavourite((message) => onNotify?.("error", message));
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
        <h2 id="recipes-heading">{t("recipes.heading")}</h2>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "new" })}>
          <span aria-hidden="true">+ </span>{t("recipes.newRecipe")}
        </button>
      </div>

      <div className="recipe-controls">
        <label className="search-field">
          <span className="visually-hidden">{t("recipes.searchLabel")}</span>
          <input
            type="search"
            placeholder={t("recipes.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="chip-group" role="group" aria-label={t("recipes.mealType")}>
          {MEAL_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={meal === value}
              onClick={() => setMeal(value)}
            >
              {value === "all" ? t("recipes.filterAll") : t(`meta.mealType.${value}`)}
            </button>
          ))}
        </div>

        <div className="chip-group" role="group" aria-label={t("recipes.sort")}>
          <button
            type="button"
            className="chip"
            aria-pressed={sort === "name"}
            onClick={() => setSort("name")}
          >
            {t("recipes.sortName")}
          </button>
          {usage && (
            <button
              type="button"
              className="chip"
              aria-pressed={sort === "variety"}
              onClick={() => setSort("variety")}
              title={t("recipes.sortVarietyTitle")}
            >
              {t("recipes.sortVariety")}
            </button>
          )}
          <button
            type="button"
            className="chip"
            aria-pressed={sort === "lately"}
            onClick={() => setSort("lately")}
            title={t("recipes.sortLatelyTitle")}
          >
            {t("recipes.sortLately")}
          </button>
        </div>

        <div className="chip-group">
          <button
            type="button"
            className="chip"
            aria-pressed={favouritesOnly}
            onClick={() => setFavouritesOnly((value) => !value)}
          >
            <span aria-hidden="true">{favouritesOnly ? "★" : "☆"}</span> {t("recipes.filterFavourites")}
          </button>
        </div>

        <details className="property-filter">
          <summary>
            {properties.length > 0
              ? t("recipes.propertiesSelected", { count: properties.length })
              : t("recipes.properties")}
          </summary>
          <div className="chip-group" role="group" aria-label={t("recipes.filterByProperty")}>
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
                  <span aria-hidden="true">{meta.icon}</span> {t(meta.labelKey)}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      {/* Only the count is announced; the list itself must not be a live region, or every
          change to a card (such as its "this week" badge) would be read out. */}
      <p className="visually-hidden" role="status" data-testid="recipe-results-count">
        {recipes ? t("recipes.resultsCount", { count: recipes.length }) : ""}
      </p>

      <div className="recipe-list" aria-busy={isPending}>
        {isPending && (
          <>
            <p className="visually-hidden">{t("recipes.loading")}</p>
            <RecipeListSkeleton />
          </>
        )}
        {isError && (
          <div className="state-box" role="alert">
            <p>{t("recipes.loadError")}</p>
            <button type="button" className="btn" onClick={() => void refetch()}>
              {t("common.retry")}
            </button>
          </div>
        )}
        {recipes && recipes.length === 0 && filtersActive && (
          <div className="state-box">
            <p>
              {favouritesOnly && !otherFiltersActive ? t("recipes.noFavourites") : t("recipes.noMatches")}
            </p>
            <button type="button" className="btn" onClick={clearFilters}>
              {t("recipes.clearFilters")}
            </button>
          </div>
        )}
        {recipes && recipes.length === 0 && !filtersActive && (
          <div className="state-box">
            <p>{t("recipes.empty")}</p>
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "new" })}>
              {t("recipes.addFirst")}
            </button>
          </div>
        )}
        {recipes?.map((recipe) =>
          renderCard ? (
            <div key={recipe.id}>{renderCard(recipe, openDetails, toggleFavourite)}</div>
          ) : (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              density={density}
              usageCount={usage?.get(recipe.id) ?? 0}
              onOpen={openDetails}
              onToggleFavourite={toggleFavourite}
              showHistory
            />
          ),
        )}
      </div>

      {(archivedCount > 0 || showArchived) && (
        <div className="archived-section">
          <button
            type="button"
            className="link-button"
            aria-expanded={showArchived}
            aria-controls="archived-list"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? t("recipes.archived.hide") : t("recipes.archived.show", { count: archivedCount })}
          </button>
          {showArchived && (
            <ul className="archived-list" id="archived-list" aria-label={t("recipes.archived.heading")}>
              {archivedList.data?.length === 0 && (
                <li className="archived-empty">
                  {filtersActive ? t("recipes.archived.noMatches") : t("recipes.archived.empty")}
                </li>
              )}
              {archivedList.data?.map((recipe) => (
                <ArchivedRow key={recipe.id} recipe={recipe} onOpen={openDetails} onNotify={onNotify} />
              ))}
            </ul>
          )}
        </div>
      )}

      <Legend />

      {dialog.kind === "new" && (
        <RecipeFormModal
          importUrl={dialog.importUrl}
          onClose={closeDialog}
          onSaved={(info) => {
            closeDialog();
            onNotify?.("info", savedMessage(info, t));
          }}
        />
      )}
      {dialog.kind === "details" && (
        <RecipeDetailsModal recipe={dialog.recipe} onClose={closeDialog} onNotify={onNotify} />
      )}
    </section>
  );
}
