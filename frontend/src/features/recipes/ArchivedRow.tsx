import { useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import type { Notify } from "./RecipeDetailsModal";
import { PROTEIN_META, proteinDotStyle } from "./recipeMeta";
import { useUpdateRecipe } from "./useRecipeMutations";

interface ArchivedRowProps {
  recipe: Recipe;
  onOpen: (recipe: Recipe) => void;
  onNotify?: Notify | undefined;
}

/** An archived recipe: opens its details, can be restored, but is never draggable or addable. */
export function ArchivedRow({ recipe, onOpen, onNotify }: ArchivedRowProps) {
  const { t } = useTranslation();
  const update = useUpdateRecipe();
  const protein = PROTEIN_META[recipe.protein];

  const restore = () =>
    update.mutate(
      { id: recipe.id, changes: { archived: false } },
      {
        onSuccess: () => onNotify?.("info", t("recipes.details.restored", { name: recipe.name })),
        onError: () => onNotify?.("error", t("recipes.details.restoreFailed", { name: recipe.name })),
      },
    );

  return (
    <li className="archived-row">
      <div className="recipe-card-body">
        <div className="recipe-card-line">
          <button
            type="button"
            className="archived-name"
            aria-haspopup="dialog"
            title={t("recipes.showDetails")}
            onClick={() => onOpen(recipe)}
          >
            {recipe.name}
          </button>
        </div>
        <p className="recipe-card-meta">
          <span className="fact" title={t("recipes.mainProtein")}>
            <span className="protein-dot" style={proteinDotStyle(protein)} aria-hidden="true" />
            <span className="visually-hidden">{t("recipes.mainProtein")}:</span>{" "}
            {t(protein.shortLabelKey)}
          </span>
          {recipe.meal_type !== "both" && <span className="fact">{t(`recipes.mealOnly.${recipe.meal_type}`)}</span>}
        </p>
      </div>
      <div className="recipe-card-actions">
        <button
          type="button"
          className="btn archived-restore"
          disabled={update.isPending}
          aria-label={t("recipes.archived.restoreNamed", { name: recipe.name })}
          onClick={restore}
        >
          {t("recipes.details.restore")}
        </button>
      </div>
    </li>
  );
}
