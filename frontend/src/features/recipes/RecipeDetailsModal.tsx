import { useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import { ConfirmDialog } from "../planner/ConfirmDialog";
import { Modal } from "../planner/Modal";
import { RecipeFormModal, savedMessage } from "./RecipeFormModal";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";
import { useDeleteRecipe, useRecipeUsage, useUpdateRecipe } from "./useRecipeMutations";

export type Notify = (kind: "error" | "info", text: string) => void;

interface RecipeDetailsModalProps {
  recipe: Recipe;
  onClose: () => void;
  onNotify?: Notify | undefined;
  /** Extra buttons shown first in the footer (e.g. "Back" from a slot menu). */
  footerStart?: ReactNode;
}

type Mode = "view" | "edit" | "delete";

/**
 * Everything about one recipe, with Edit, Archive / Restore and Delete. Deleting asks for a
 * usage-aware confirmation that recommends archiving when the recipe is planned somewhere.
 */
export function RecipeDetailsModal({ recipe: initial, onClose, onNotify, footerStart }: RecipeDetailsModalProps) {
  const { t } = useTranslation();
  const [recipe, setRecipe] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const update = useUpdateRecipe();

  const setArchived = (archived: boolean) =>
    update.mutate(
      { id: recipe.id, changes: { archived } },
      {
        onSuccess: () => {
          onNotify?.(
            "info",
            t(archived ? "recipes.details.archived" : "recipes.details.restored", { name: recipe.name }),
          );
          onClose();
        },
        onError: () =>
          onNotify?.(
            "error",
            t(archived ? "recipes.details.archiveFailed" : "recipes.details.restoreFailed", {
              name: recipe.name,
            }),
          ),
      },
    );

  if (mode === "edit") {
    return (
      <RecipeFormModal
        key="edit"
        recipe={recipe}
        onClose={() => setMode("view")}
        onSaved={(info) => {
          setRecipe(info.recipe);
          setMode("view");
          onNotify?.("info", savedMessage(info, t));
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
          onNotify?.("info", t("recipes.details.deleted", { name: recipe.name }));
          onClose();
        }}
        onArchive={() => setArchived(true)}
        archiving={update.isPending}
        onError={() => onNotify?.("error", t("recipes.details.deleteFailed", { name: recipe.name }))}
      />
    );
  }

  const meal = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];
  return (
    <Modal key="view" title={recipe.name} onClose={onClose}>
      <div className="details">
        {recipe.archived && (
          <p className="details-archived" role="note">
            <span aria-hidden="true">🗄️</span> {t("recipes.details.archivedNote")}
          </p>
        )}
        <dl className="details-facts">
          <div>
            <dt>{t("recipes.legendMeal")}</dt>
            <dd>
              <span aria-hidden="true">{meal.icon}</span> {t(meal.labelKey)}
            </dd>
          </div>
          <div>
            <dt>{t("recipes.mainProtein")}</dt>
            <dd>
              <span aria-hidden="true">{protein.icon}</span> {t(protein.labelKey)}
            </dd>
          </div>
          {recipe.prep_minutes !== null && (
            <div>
              <dt>{t("recipes.prepTime")}</dt>
              <dd>
                <span aria-hidden="true">⏱️</span> {t("recipes.minutes", { count: recipe.prep_minutes })}
              </dd>
            </div>
          )}
        </dl>

        {recipe.description && <p className="details-description">{recipe.description}</p>}

        <h3 className="details-heading">{t("recipes.ingredients")}</h3>
        <ul className="details-ingredients" aria-label={t("recipes.ingredients")}>
          {recipe.ingredients.map((ingredient, index) => (
            <li key={index}>{ingredient}</li>
          ))}
        </ul>

        {recipe.properties.length > 0 && (
          <>
            <h3 className="details-heading">{t("recipes.properties")}</h3>
            <ul className="details-properties" aria-label={t("recipes.properties")}>
              {recipe.properties.map((property) => (
                <li key={property}>
                  <span aria-hidden="true">{PROPERTY_META[property].icon}</span> {t(PROPERTY_META[property].labelKey)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="form-actions">
        {footerStart}
        <button type="button" className="btn btn-large btn-danger" onClick={() => setMode("delete")}>
          {t("common.delete")}
        </button>
        <button
          type="button"
          className="btn btn-large"
          disabled={update.isPending}
          onClick={() => setArchived(!recipe.archived)}
        >
          {recipe.archived ? t("recipes.details.restore") : t("recipes.details.archive")}
        </button>
        <button type="button" className="btn btn-large btn-primary" onClick={() => setMode("edit")}>
          {t("common.edit")}
        </button>
      </div>
    </Modal>
  );
}

interface DeleteConfirmProps {
  recipe: Recipe;
  onCancel: () => void;
  onDeleted: () => void;
  onArchive: () => void;
  archiving: boolean;
  onError: () => void;
}

function DeleteConfirm({ recipe, onCancel, onDeleted, onArchive, archiving, onError }: DeleteConfirmProps) {
  const { t } = useTranslation();
  const usage = useRecipeUsage(recipe.id);
  const remove = useDeleteRecipe();
  const count = usage.data?.count ?? 0;

  // Planned somewhere: deleting rewrites history, so archiving is the recommended button.
  if (usage.data && count > 0 && !recipe.archived) {
    const busy = remove.isPending || archiving;
    return (
      <Modal title={t("recipes.details.deleteTitle", { name: recipe.name })} onClose={onCancel}>
        <div className="confirm-body">
          <p>
            <Trans i18nKey="recipes.details.planned" count={count} components={{ strong: <strong /> }} />
          </p>
          <p>{t("recipes.details.archiveAdvice")}</p>
        </div>
        <div className="confirm-actions confirm-actions--stack">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onArchive}>
            {archiving ? t("recipes.details.archiving") : t("recipes.details.archiveInstead")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => remove.mutate(recipe.id, { onSuccess: onDeleted, onError })}
          >
            {remove.isPending ? t("recipes.details.deleting") : t("recipes.details.deletePermanently")}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <ConfirmDialog
      title={t("recipes.details.deleteTitle", { name: recipe.name })}
      confirmLabel={remove.isPending ? t("recipes.details.deleting") : t("recipes.details.deleteConfirm")}
      busy={remove.isPending || usage.isPending}
      onCancel={onCancel}
      onConfirm={() => {
        if (remove.isPending || usage.isPending) return;
        remove.mutate(recipe.id, { onSuccess: onDeleted, onError });
      }}
    >
      {usage.isPending && <p>{t("recipes.details.checking")}</p>}
      {usage.isError && <p>{t("recipes.details.checkFailed")}</p>}
      {usage.data && count === 0 && <p>{t("recipes.details.notPlanned")}</p>}
      {usage.data && count > 0 && (
        <p>
          <Trans i18nKey="recipes.details.planned" count={count} components={{ strong: <strong /> }} />
        </p>
      )}
    </ConfirmDialog>
  );
}
