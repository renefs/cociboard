import { useId, useState } from "react";
import type { Recipe } from "../../api/types";
import { MetaIcon } from "./MetaIcon";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";

export const COLLAPSED_INGREDIENTS = 4;

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const mealType = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];

  const hiddenCount = Math.max(0, recipe.ingredients.length - COLLAPSED_INGREDIENTS);
  const visible = expanded ? recipe.ingredients : recipe.ingredients.slice(0, COLLAPSED_INGREDIENTS);

  return (
    <article className="recipe-card" aria-label={recipe.name}>
      <header className="recipe-card-header">
        <h3 className="recipe-card-title">{recipe.name}</h3>
        <span
          className="badge"
          style={{ "--badge-color": mealType.color } as React.CSSProperties}
          data-testid="meal-type-badge"
        >
          <span aria-hidden="true">{mealType.icon}</span> {mealType.label}
        </span>
      </header>

      <p className="recipe-card-facts">
        {recipe.prep_minutes !== null && (
          <span className="fact">
            <span aria-hidden="true">⏱️</span> {recipe.prep_minutes} min
          </span>
        )}
        <span className="fact" title="Main protein">
          <span aria-hidden="true">{protein.icon}</span>{" "}
          <span className="visually-hidden">Main protein: </span>
          {protein.label}
        </span>
      </p>

      <ul className="ingredients" id={listId} aria-label="Ingredients">
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
          {expanded ? "Show fewer" : `+${hiddenCount} more`}
        </button>
      )}

      {recipe.properties.length > 0 && (
        <ul className="property-icons" aria-label="Properties">
          {recipe.properties.map((property) => (
            <li key={property}>
              <MetaIcon meta={PROPERTY_META[property]} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
