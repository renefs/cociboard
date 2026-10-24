import { useState, type ReactNode } from "react";
import type { Recipe } from "../../api/types";
import { ConfirmDialog } from "../planner/ConfirmDialog";
import { Modal } from "../planner/Modal";
import { RecipeFormModal, savedMessage } from "./RecipeFormModal";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";
import { useDeleteRecipe, useRecipeUsage } from "./useRecipeMutations";

export type Notify = (kind: "error" | "info", text: string) => void;

interface RecipeDetailsModalProps {
  recipe: Recipe;
  onClose: () => void;
  onNotify?: Notify | undefined;
  /** Extra buttons shown first in the footer (e.g. "Back" from a slot menu). */
  footerStart?: ReactNode;
}

type Mode = "view" | "edit" | "delete";

/** Everything about one recipe, with Edit and Delete (with a usage-aware confirmation). */
export function RecipeDetailsModal({ recipe: initial, onClose, onNotify, footerStart }: RecipeDetailsModalProps) {
  const [recipe, setRecipe] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");

  if (mode === "edit") {
    return (
      <RecipeFormModal
        key="edit"
        recipe={recipe}
        onClose={() => setMode("view")}
        onSaved={(info) => {
          setRecipe(info.recipe);
          setMode("view");
          onNotify?.("info", savedMessage(info));
        }}
      />
    );
  }
  if (mode === "delete") {
    return (
      <DeleteConfirm
        key="delete"
        recipe={recipe}
        onCancel={() => setMode("view")}
        onDeleted={() => {
          onNotify?.("info", `Deleted ${recipe.name}.`);
          onClose();
        }}
        onError={() => onNotify?.("error", `Couldn't delete ${recipe.name}. Please try again.`)}
      />
    );
  }

  const meal = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];
  return (
    <Modal key="view" title={recipe.name} onClose={onClose}>
      <div className="details">
        <dl className="details-facts">
          <div>
            <dt>Meal</dt>
            <dd>
              <span aria-hidden="true">{meal.icon}</span> {meal.label}
            </dd>
          </div>
          <div>
            <dt>Main protein</dt>
            <dd>
              <span aria-hidden="true">{protein.icon}</span> {protein.label}
            </dd>
          </div>
          {recipe.prep_minutes !== null && (
            <div>
              <dt>Prep time</dt>
              <dd>
                <span aria-hidden="true">⏱️</span> {recipe.prep_minutes} min
              </dd>
            </div>
          )}
        </dl>

        {recipe.description && <p className="details-description">{recipe.description}</p>}

        <h3 className="details-heading">Ingredients</h3>
        <ul className="details-ingredients" aria-label="Ingredients">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={index}>{ingredient}</li>
          ))}
        </ul>

        {recipe.properties.length > 0 && (
          <>
            <h3 className="details-heading">Properties</h3>
            <ul className="details-properties" aria-label="Properties">
              {recipe.properties.map((property) => (
                <li key={property}>
                  <span aria-hidden="true">{PROPERTY_META[property].icon}</span> {PROPERTY_META[property].label}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="form-actions">
        {footerStart}
        <button type="button" className="btn btn-large btn-danger" onClick={() => setMode("delete")}>
          Delete
        </button>
        <button type="button" className="btn btn-large btn-primary" onClick={() => setMode("edit")}>
          Edit
        </button>
      </div>
    </Modal>
  );
}

interface DeleteConfirmProps {
  recipe: Recipe;
  onCancel: () => void;
  onDeleted: () => void;
  onError: () => void;
}

function DeleteConfirm({ recipe, onCancel, onDeleted, onError }: DeleteConfirmProps) {
  const usage = useRecipeUsage(recipe.id);
  const remove = useDeleteRecipe();
  const count = usage.data?.count ?? 0;

  return (
    <ConfirmDialog
      title={`Delete ${recipe.name}?`}
      confirmLabel={remove.isPending ? "Deleting…" : "Delete recipe"}
      busy={remove.isPending || usage.isPending}
      onCancel={onCancel}
      onConfirm={() => {
        if (remove.isPending || usage.isPending) return;
        remove.mutate(recipe.id, { onSuccess: onDeleted, onError });
      }}
    >
      {usage.isPending && <p>Checking where this recipe is planned…</p>}
      {usage.isError && (
        <p>
          Couldn&apos;t check whether this recipe is planned. Deleting it also removes it from any week
          that uses it.
        </p>
      )}
      {usage.data && count === 0 && <p>This recipe is not planned in any week. This cannot be undone.</p>}
      {usage.data && count > 0 && (
        <p>
          This recipe is planned in <strong>{count}</strong> {count === 1 ? "meal" : "meals"} across your
          weeks. Deleting it also removes {count === 1 ? "that meal" : "those meals"} from the plan. This
          cannot be undone.
        </p>
      )}
    </ConfirmDialog>
  );
}
