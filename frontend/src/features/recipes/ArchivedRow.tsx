import { useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import type { Notify } from "./RecipeDetailsModal";
import { MetaIcon } from "./MetaIcon";
import { MEAL_TYPE_META, PROTEIN_META } from "./recipeMeta";
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
      <button
        type="button"
        className="archived-name"
        aria-haspopup="dialog"
        title={t("recipes.showDetails")}
        onClick={() => onOpen(recipe)}
      >
        {recipe.name}
      </button>
      <span className="archived-meta">
        <MetaIcon meta={MEAL_TYPE_META[recipe.meal_type]} />
        <span aria-hidden="true">{protein.icon}</span>
      </span>
      <button
        type="button"
        className="btn archived-restore"
        disabled={update.isPending}
        aria-label={t("recipes.archived.restoreNamed", { name: recipe.name })}
        onClick={restore}
      >
        {t("recipes.details.restore")}
      </button>
    </li>
  );
}
