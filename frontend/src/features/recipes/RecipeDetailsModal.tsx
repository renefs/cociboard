import { useState, type CSSProperties, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { ConfirmDialog } from "../planner/ConfirmDialog";
import { Modal } from "../planner/Modal";
import { FavouriteToggle } from "./RecipeCard";
import { formatWeekdayDate } from "../planner/weekMath";
import { nextMeal, whenText } from "./historyLogic";
import { RecipeFormModal, savedMessage } from "./RecipeFormModal";
import { SERVINGS_ICON } from "./recipeMeta";
import { sourceHost } from "./recipeFormLogic";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";
import {
  useDeleteRecipe,
  useRecipeHistory,
  useRecipeUsage,
  useToggleFavourite,
  useUpdateRecipe,
} from "./useRecipeMutations";

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
  // The recipe above is a snapshot; the star follows the toggle at once and goes back on failure.
  const [favourite, setFavourite] = useState(initial.favourite);
  const toggleFavourite = useToggleFavourite((message, input) => {
    setFavourite(!input.favourite);
    onNotify?.("error", message);
  });

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
          setFavourite(info.recipe.favourite);
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

  // Only http(s) links become anchors, whatever is stored.
  const host = recipe.source_url === null ? null : sourceHost(recipe.source_url);
  const sourceLink = host !== null && recipe.source_url !== null ? { host, href: recipe.source_url.trim() } : null;
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
          {recipe.servings !== null && (
            <div>
              <dt>{t("recipes.servingsLabel")}</dt>
              <dd>
                <span aria-hidden="true">{SERVINGS_ICON}</span> {t("recipes.serves", { count: recipe.servings })}
              </dd>
            </div>
          )}
        </dl>

        <p className="details-favourite">
          <FavouriteToggle
            recipe={recipe}
            favourite={favourite}
            onToggle={(target, value) => {
              setFavourite(value);
              toggleFavourite(target, value);
            }}
          />
          <span aria-hidden="true">{t("recipes.favourite.is")}</span>
        </p>

        {recipe.description && <p className="details-description">{recipe.description}</p>}

        <h3 className="details-heading">{t("recipes.ingredients")}</h3>
        <ul className="details-ingredients" aria-label={t("recipes.ingredients")}>
          {recipe.ingredients.map((ingredient, index) => (
            <li key={index}>{ingredient}</li>
          ))}
        </ul>

        {recipe.steps.length > 0 && (
          <>
            <h3 className="details-heading">{t("recipes.steps")}</h3>
            <ol className="details-steps" aria-label={t("recipes.steps")}>
              {recipe.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </>
        )}

        {sourceLink && (
          <p className="details-source">
            <a href={sourceLink.href} target="_blank" rel="noopener noreferrer">
              {t("recipes.viewSource", { host: sourceLink.host })}
            </a>
          </p>
        )}

        <HistorySection recipeId={recipe.id} />

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

/** When the recipe was planned: totals and the latest meals, past and upcoming. */
function HistorySection({ recipeId }: { recipeId: number }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const history = useRecipeHistory(recipeId);
  const data = history.data;
  const next = data ? nextMeal(data.meals, data.next_planned_on) : null;
  return (
    <>
      <h3 className="details-heading">{t("recipes.history.heading")}</h3>
      {history.isPending && <p className="status-message">{t("recipes.history.loading")}</p>}
      {history.isError && (
        <p className="status-message" role="alert">
          {t("recipes.history.error")}{" "}
          <button type="button" className="link-button" onClick={() => void history.refetch()}>
            {t("common.retry")}
          </button>
        </p>
      )}
      {data && (
        <>
          <p className="details-history-totals">
            {data.times_planned > 0 ? t("recipes.history.planned", { count: data.times_planned }) : t("recipes.history.never")}
            {data.next_planned_on !== null && (
              <>
                {" · "}
                {t("recipes.history.next", {
                  when: next ? whenText(next.date, next.slot, t, locale) : formatWeekdayDate(data.next_planned_on, locale),
                })}
              </>
            )}
          </p>
          {data.meals.length === 0 ? (
            <p className="status-message">{t("recipes.history.empty")}</p>
          ) : (
            <ul className="details-history" aria-label={t("recipes.history.list")}>
              {data.meals.map((meal) => (
                <li key={`${meal.date}-${meal.slot}`}>
                  <span>{whenText(meal.date, meal.slot, t, locale)}</span>
                  {meal.upcoming && <span className="badge badge--small" style={{ "--badge-color": "var(--color-primary)" } as CSSProperties}>{t("recipes.history.upcoming")}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
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
