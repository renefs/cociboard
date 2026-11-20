import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import { Modal } from "../planner/Modal";
import { RecipeForm, type SavedInfo } from "./RecipeForm";

interface RecipeFormModalProps {
  recipe?: Recipe | undefined;
  /** A link to import at once (new recipes only). */
  importUrl?: string | undefined;
  onSaved: (info: SavedInfo) => void;
  onClose: () => void;
}

/** The recipe form in the shared modal: a full-screen sheet on phones. */
export function RecipeFormModal({ recipe, importUrl, onSaved, onClose }: RecipeFormModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={recipe ? t("recipeForm.editTitle", { name: recipe.name }) : t("recipeForm.newTitle")}
      size="full"
      closeOnBackdrop={false}
      focusInput
      onClose={onClose}
    >
      <RecipeForm recipe={recipe} importUrl={importUrl} onSaved={onSaved} onCancel={onClose} />
    </Modal>
  );
}

/** Toast text after a successful save. */
export function savedMessage({ recipe, created, removedMeals }: SavedInfo, t: TFunction): string {
  if (created) return t("recipes.saved.created", { name: recipe.name });
  if (removedMeals > 0) {
    return t("recipes.saved.updatedRemoved", { name: recipe.name, count: removedMeals });
  }
  return t("recipes.saved.updated", { name: recipe.name });
}
