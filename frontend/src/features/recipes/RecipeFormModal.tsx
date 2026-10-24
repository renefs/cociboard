import type { Recipe } from "../../api/types";
import { Modal } from "../planner/Modal";
import { RecipeForm, type SavedInfo } from "./RecipeForm";

interface RecipeFormModalProps {
  recipe?: Recipe | undefined;
  onSaved: (info: SavedInfo) => void;
  onClose: () => void;
}

/** The recipe form in the shared modal: a full-screen sheet on phones. */
export function RecipeFormModal({ recipe, onSaved, onClose }: RecipeFormModalProps) {
  return (
    <Modal
      title={recipe ? `Edit ${recipe.name}` : "New recipe"}
      size="full"
      closeOnBackdrop={false}
      focusInput
      onClose={onClose}
    >
      <RecipeForm recipe={recipe} onSaved={onSaved} onCancel={onClose} />
    </Modal>
  );
}

/** Toast text after a successful save. */
export function savedMessage({ recipe, created, removedMeals }: SavedInfo): string {
  if (created) return `Created ${recipe.name}.`;
  const removed =
    removedMeals > 0
      ? ` Removed ${removedMeals} planned ${removedMeals === 1 ? "meal" : "meals"} that no longer fit.`
      : "";
  return `Saved ${recipe.name}.${removed}`;
}
