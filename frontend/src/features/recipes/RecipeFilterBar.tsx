import { useId, useRef, useState } from "react";
import { Search, SlidersHorizontal, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RECIPE_PROPERTIES, type MealSlot, type RecipeProperty } from "../../api/types";
import { activeFilterCount, type SortMode } from "./filterLogic";
import { PROPERTY_META } from "./recipeMeta";

export type MealFilter = MealSlot | "all";

const MEAL_FILTERS: MealFilter[] = ["all", "lunch", "dinner"];

interface RecipeFilterBarProps {
  search: string;
  onSearch: (value: string) => void;
  meal: MealFilter;
  onMeal: (value: MealFilter) => void;
  favouritesOnly: boolean;
  onFavouritesOnly: (value: boolean) => void;
  sort: SortMode;
  onSort: (value: SortMode) => void;
  /** Whether "Best for variety" is offered (the planner provides the week's usage). */
  varietyAvailable: boolean;
  properties: RecipeProperty[];
  onToggleProperty: (property: RecipeProperty) => void;
  /** Resets what is inside the Filters panel: the sort and the properties. */
  onClearPanel: () => void;
  /** Number of recipes shown; `undefined` while loading. */
  resultCount: number | undefined;
}

/**
 * The search field, one row of quick filters (meal type, favourites) and a "Filters" button
 * that expands an inline panel with the sort and the property filters.
 */
export function RecipeFilterBar({
  search,
  onSearch,
  meal,
  onMeal,
  favouritesOnly,
  onFavouritesOnly,
  sort,
  onSort,
  varietyAvailable,
  properties,
  onToggleProperty,
  onClearPanel,
  resultCount,
}: RecipeFilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const activeCount = activeFilterCount(sort, properties);
  const sortLabel =
    sort === "variety" ? t("recipes.sortVariety") : sort === "lately" ? t("recipes.sortLately") : t("recipes.sortName");

  return (
    <div
      className="recipe-controls"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <label className="search-field">
        <span className="visually-hidden">{t("recipes.searchLabel")}</span>
        <Search aria-hidden="true" size={16} className="search-icon" />
        <input
          type="search"
          placeholder={t("recipes.searchPlaceholder")}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>

      <div className="filter-row">
        <div className="segmented" role="group" aria-label={t("recipes.mealType")}>
          {MEAL_FILTERS.map((value) => (
            <button key={value} type="button" aria-pressed={meal === value} onClick={() => onMeal(value)}>
              {value === "all" ? t("recipes.filterAll") : t(`meta.mealType.${value}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chip"
          aria-pressed={favouritesOnly}
          onClick={() => onFavouritesOnly(!favouritesOnly)}
        >
          <Star aria-hidden="true" size={15} fill={favouritesOnly ? "currentColor" : "none"} />
          {t("recipes.filterFavourites")}
        </button>
        <button
          type="button"
          ref={triggerRef}
          className="chip filters-button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" size={15} />
          {t("recipes.filters")}
          {activeCount > 0 && (
            <>
              {" "}
              <span className="filters-count">{activeCount}</span>
              {" "}
              <span className="visually-hidden">{t("recipes.filtersActive", { count: activeCount })}</span>
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="filters-panel" id={panelId} role="group" aria-label={t("recipes.filtersPanel")}>
          <div className="filters-group">
            <p className="filters-label" aria-hidden="true">
              {t("recipes.sort")}
            </p>
            <div className="chip-group" role="group" aria-label={t("recipes.sort")}>
              <button type="button" className="chip" aria-pressed={sort === "name"} onClick={() => onSort("name")}>
                {t("recipes.sortName")}
              </button>
              {varietyAvailable && (
                <button
                  type="button"
                  className="chip"
                  aria-pressed={sort === "variety"}
                  onClick={() => onSort("variety")}
                  title={t("recipes.sortVarietyTitle")}
                >
                  {t("recipes.sortVariety")}
                </button>
              )}
              <button
                type="button"
                className="chip"
                aria-pressed={sort === "lately"}
                onClick={() => onSort("lately")}
                title={t("recipes.sortLatelyTitle")}
              >
                {t("recipes.sortLately")}
              </button>
            </div>
          </div>
          <div className="filters-group">
            <p className="filters-label" aria-hidden="true">
              {t("recipes.properties")}
            </p>
            <div className="chip-group" role="group" aria-label={t("recipes.filterByProperty")}>
              {RECIPE_PROPERTIES.map((property) => {
                const meta = PROPERTY_META[property];
                return (
                  <button
                    key={property}
                    type="button"
                    className="chip"
                    aria-pressed={properties.includes(property)}
                    onClick={() => onToggleProperty(property)}
                  >
                    <span aria-hidden="true">{meta.icon}</span> {t(meta.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onClearPanel();
                // The link disappears; keep the focus in the panel's controls.
                triggerRef.current?.focus();
              }}
            >
              {t("recipes.clearFilters")}
            </button>
          )}
        </div>
      )}

      {/* The visible count is the status region: it is announced when the results change, and
          the list itself is not live (a card's "this week" text would be read out each time). */}
      <p className="recipe-results" role="status" data-testid="recipe-results-count">
        {resultCount === undefined ? "" : t("recipes.resultsLine", { count: resultCount, sort: sortLabel })}
      </p>
    </div>
  );
}
