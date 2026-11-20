import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import { MetaIcon } from "./MetaIcon";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META, SERVINGS_ICON } from "./recipeMeta";

export const COLLAPSED_INGREDIENTS = 4;
/** Compact cards show a one-line summary; offer expansion beyond this many characters. */
export const COMPACT_SUMMARY_CHARS = 36;

/** Icon plus number; the accessible name is the whole sentence ("Serves 4"). */
function ServingsFact({ servings }: { servings: number | null }) {
  const { t } = useTranslation();
  if (servings === null) return null;
  const label = t("recipes.serves", { count: servings });
  return (
    <span className="fact" role="img" aria-label={label} title={label}>
      <span aria-hidden="true">{SERVINGS_ICON}</span> <span aria-hidden="true">{servings}</span>
    </span>
  );
}

export type CardDensity = "comfortable" | "compact";

interface RecipeCardProps {
  recipe: Recipe;
  density?: CardDensity;
  /** Extra controls (e.g. an "Add" button) shown next to the title. */
  actions?: ReactNode;
  /** How often the recipe is planned this week; shown as a badge when above zero. */
  usageCount?: number;
  /** Extra content below the details (the picker adds its variety hint here). */
  extra?: ReactNode;
  /** When given, the title becomes a button that opens the recipe details. */
  onOpen?: ((recipe: Recipe) => void) | undefined;
}

function CardTitle({ recipe, onOpen }: Pick<RecipeCardProps, "recipe" | "onOpen">) {
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

/** "×2 this week" badge for recipes already in the plan. */
export function UsageBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  const label = t("recipes.usageLabel", { count });
  return (
    <span className="badge badge--small usage-badge" title={label}>
      <span aria-hidden="true">{t("recipes.usageBadge", { count })}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function RecipeCard({ recipe, density = "comfortable", ...rest }: RecipeCardProps) {
  return density === "compact" ? (
    <CompactCard recipe={recipe} {...rest} />
  ) : (
    <ComfortableCard recipe={recipe} {...rest} />
  );
}

function ComfortableCard({ recipe, actions, usageCount = 0, extra, onOpen }: Omit<RecipeCardProps, "density">) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const mealType = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];

  const hiddenCount = Math.max(0, recipe.ingredients.length - COLLAPSED_INGREDIENTS);
  const visible = expanded ? recipe.ingredients : recipe.ingredients.slice(0, COLLAPSED_INGREDIENTS);

  return (
    <article className="recipe-card" aria-label={recipe.name}>
      <header className="recipe-card-header">
        <CardTitle recipe={recipe} onOpen={onOpen} />
        <span
          className="badge"
          style={{ "--badge-color": mealType.color } as CSSProperties}
          data-testid="meal-type-badge"
        >
          <span aria-hidden="true">{mealType.icon}</span> {t(mealType.labelKey)}
        </span>
        {actions}
      </header>

      <p className="recipe-card-facts">
        {recipe.prep_minutes !== null && (
          <span className="fact">
            <span aria-hidden="true">⏱️</span> {t("recipes.minutes", { count: recipe.prep_minutes })}
          </span>
        )}
        <ServingsFact servings={recipe.servings} />
        <span className="fact" title={t("recipes.mainProtein")}>
          <span aria-hidden="true">{protein.icon}</span>{" "}
          <span className="visually-hidden">{t("recipes.mainProtein")}: </span>
          {t(protein.labelKey)}
        </span>
        <UsageBadge count={usageCount} />
      </p>

      <ul className="ingredients" id={listId} aria-label={t("recipes.ingredients")}>
        {visible.map((ingredient) => (
          <li key={ingredient}>{ingredient}</li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="link-button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t("recipes.showFewer") : t("recipes.moreIngredients", { count: hiddenCount })}
        </button>
      )}

      {recipe.properties.length > 0 && (
        <ul className="property-icons" aria-label={t("recipes.properties")}>
          {recipe.properties.map((property) => (
            <li key={property}>
              <MetaIcon meta={PROPERTY_META[property]} />
            </li>
          ))}
        </ul>
      )}
      {extra}
    </article>
  );
}

/** Dense variant used while planning: name, icons and a one-line ingredient summary. */
function CompactCard({ recipe, actions, usageCount = 0, extra, onOpen }: Omit<RecipeCardProps, "density">) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
  const mealType = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];
  const summary = recipe.ingredients.join(", ");
  const canExpand = summary.length > COMPACT_SUMMARY_CHARS;

  return (
    <article className="recipe-card recipe-card--compact" aria-label={recipe.name}>
      <header className="recipe-card-header">
        <CardTitle recipe={recipe} onOpen={onOpen} />
        {actions}
      </header>

      <div className="recipe-card-meta">
        <span
          className="badge badge--small"
          style={{ "--badge-color": mealType.color } as CSSProperties}
          data-testid="meal-type-badge"
        >
          <span aria-hidden="true">{mealType.icon}</span> {t(mealType.labelKey)}
        </span>
        {recipe.prep_minutes !== null && (
          <span className="fact">
            <span aria-hidden="true">⏱️</span> {t("recipes.minutes", { count: recipe.prep_minutes })}
          </span>
        )}
        <ServingsFact servings={recipe.servings} />
        <span className="fact" title={t("recipes.mainProtein")}>
          <span aria-hidden="true">{protein.icon}</span>{" "}
          <span className="visually-hidden">{t("recipes.mainProtein")}: </span>
          {t(protein.labelKey)}
        </span>
        <UsageBadge count={usageCount} />
        {recipe.properties.length > 0 && (
          <ul className="property-icons property-icons--small" aria-label={t("recipes.properties")}>
            {recipe.properties.map((property) => (
              <li key={property}>
                <MetaIcon meta={PROPERTY_META[property]} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {extra}

      <div className="ingredients-row">
        <p
          className={expanded ? "ingredients-summary is-expanded" : "ingredients-summary"}
          id={summaryId}
          title={summary}
        >
          <span className="visually-hidden">{t("recipes.ingredients")}: </span>
          {summary}
        </p>
        {canExpand && (
          <button
            type="button"
            className="link-button link-button--inline"
            aria-expanded={expanded}
            aria-controls={summaryId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("recipes.showFewer") : t("recipes.showAll")}
          </button>
        )}
      </div>
    </article>
  );
}
