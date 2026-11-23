import type { ReactNode } from "react";
import { Clock, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import { lastMadeText } from "./historyLogic";
import { PROTEIN_META, proteinDotStyle } from "./recipeMeta";

interface FavouriteToggleProps {
  recipe: Pick<Recipe, "id" | "name" | "favourite">;
  favourite?: boolean;
  onToggle: (recipe: Pick<Recipe, "id" | "name">, favourite: boolean) => void;
}

/** A ghost star button: filled when the recipe is a favourite. 36px with a mouse, 44px on touch. */
export function FavouriteToggle({ recipe, favourite = recipe.favourite, onToggle }: FavouriteToggleProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="favourite-toggle"
      aria-pressed={favourite}
      aria-label={t(favourite ? "recipes.favourite.remove" : "recipes.favourite.add", { name: recipe.name })}
      // The row is draggable: a press on the star must not reach its drag listeners (a held
      // press on a touch screen would start a drag), and the click must not select the row.
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(recipe, !favourite);
      }}
    >
      <Star aria-hidden="true" size={18} fill={favourite ? "currentColor" : "none"} />
    </button>
  );
}

/** A small, non-interactive filled star for favourites (slot picker rows). */
export function FavouriteMark() {
  const { t } = useTranslation();
  const label = t("recipes.favourite.is");
  return (
    <span className="favourite-mark" role="img" aria-label={label} title={label}>
      <Star aria-hidden="true" size={14} fill="currentColor" />
    </span>
  );
}

/** "Last made 3 weeks ago" / "Never planned". */
function HistoryFact({ recipe }: { recipe: Pick<Recipe, "last_planned_on"> }) {
  const { t } = useTranslation();
  return <span className="fact fact--history">{lastMadeText(recipe, new Date(), t)}</span>;
}

interface RecipeCardProps {
  recipe: Recipe;
  /** The row's action (e.g. the round "Add" button), shown at the right of the name. */
  actions?: ReactNode;
  /** Shown before the star (the panel's drag handle). */
  leading?: ReactNode;
  /** How often the recipe is planned this week; shown as muted text when above zero. */
  usageCount?: number;
  /** Extra content below the meta line (the picker puts the reason for its ranking here). */
  extra?: ReactNode;
  /** Shown after the name (the picker's "Good pick" tag). */
  nameTag?: ReactNode;
  /** A tinted row (the picker's good picks). */
  highlight?: boolean;
  /** When given, the name becomes a button that opens the recipe details. */
  onOpen?: ((recipe: Recipe) => void) | undefined;
  /**
   * When given, the row has a star button. Without it a favourite shows a small star that
   * is not a button (slot picker).
   */
  onToggleFavourite?: ((recipe: Pick<Recipe, "id" | "name">, favourite: boolean) => void) | undefined;
  /** Show "Last made ..." / "Never planned" in the meta line (the catalogue does; the picker doesn't). */
  showHistory?: boolean;
}

function RecipeName({ recipe, onOpen }: Pick<RecipeCardProps, "recipe" | "onOpen">) {
  const { t } = useTranslation();
  if (!onOpen) return <h3 className="recipe-card-title">{recipe.name}</h3>;
  return (
    <h3 className="recipe-card-title">
      <button
        type="button"
        className="card-title-button"
        aria-haspopup="dialog"
        title={t("recipes.showDetails")}
        onClick={() => onOpen(recipe)}
      >
        {recipe.name}
      </button>
    </h3>
  );
}

/** "×2 this week" as quiet text for recipes already in the plan. */
export function UsageBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  const label = t("recipes.usageLabel", { count });
  return (
    <span className="fact fact--usage" title={label}>
      <span aria-hidden="true">{t("recipes.usageBadge", { count })}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

/**
 * One compact recipe row (panel, phone Recipes view, slot picker): the name with the row's
 * action, and a muted meta line: protein, prep time, the meal type when it is not "both", and
 * either how often it is planned this week or when it was last made.
 */
export function RecipeCard({
  recipe,
  actions,
  leading,
  usageCount = 0,
  extra,
  nameTag,
  highlight = false,
  onOpen,
  onToggleFavourite,
  showHistory = false,
}: RecipeCardProps) {
  const { t } = useTranslation();
  const protein = PROTEIN_META[recipe.protein];

  return (
    <article className={highlight ? "recipe-card recipe-card--good" : "recipe-card"} aria-label={recipe.name}>
      <div className="recipe-card-body">
        <div className="recipe-card-line">
          <RecipeName recipe={recipe} onOpen={onOpen} />
          {!onToggleFavourite && recipe.favourite && <FavouriteMark />}
          {nameTag}
        </div>
        <p className="recipe-card-meta">
          <span className="fact" title={t("recipes.mainProtein")}>
            <span className="protein-dot" style={proteinDotStyle(protein)} aria-hidden="true" />
            <span className="visually-hidden">{t("recipes.mainProtein")}:</span>{" "}
            {t(protein.shortLabelKey)}
          </span>
          {recipe.prep_minutes !== null && (
            <span className="fact">
              <Clock aria-hidden="true" size={13} className="icon" /> {t("recipes.minutes", { count: recipe.prep_minutes })}
            </span>
          )}
          {recipe.meal_type !== "both" && <span className="fact">{t(`recipes.mealOnly.${recipe.meal_type}`)}</span>}
          {usageCount > 0 ? <UsageBadge count={usageCount} /> : showHistory && <HistoryFact recipe={recipe} />}
        </p>
        {extra}
      </div>
      {(onToggleFavourite || actions || leading) && (
        <div className="recipe-card-actions">
          {leading}
          {onToggleFavourite && <FavouriteToggle recipe={recipe} onToggle={onToggleFavourite} />}
          {actions}
        </div>
      )}
    </article>
  );
}
