import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Recipe } from "../../api/types";
import { RecipeCard } from "../recipes/RecipeCard";
import { recipeDragId, type DragSource } from "./dragLogic";

interface DraggableRecipeCardProps {
  recipe: Recipe;
  /** Whether this recipe is the one currently being placed in select mode. */
  selected: boolean;
  onAdd: (recipe: Recipe) => void;
  /** Times the recipe is planned in the shown week. */
  usageCount?: number;
  /** Opens the recipe details. */
  onOpen?: (recipe: Recipe) => void;
  /** Stars or unstars the recipe. */
  onToggleFavourite?: (recipe: Pick<Recipe, "id" | "name">, favourite: boolean) => void;
}

/** A compact recipe row for the panel: draggable, with a round "Add" button for tap-to-place. */
export function DraggableRecipeCard({
  recipe,
  selected,
  onAdd,
  usageCount = 0,
  onOpen,
  onToggleFavourite,
}: DraggableRecipeCardProps) {
  const { t } = useTranslation();
  const source: DragSource = { kind: "recipe", recipe };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: recipeDragId(recipe),
    data: source,
  });

  return (
    <div
      ref={setNodeRef}
      className={`draggable-card${isDragging ? " is-dragging" : ""}${selected ? " is-selected" : ""}`}
      {...listeners}
    >
      <RecipeCard
        recipe={recipe}
        usageCount={usageCount}
        onOpen={onOpen}
        onToggleFavourite={onToggleFavourite}
        showHistory
        leading={
          <button
            type="button"
            className="icon-button drag-handle"
            ref={setActivatorNodeRef}
            {...attributes}
            aria-pressed={undefined}
            aria-label={t("planner.dragRecipe", { name: recipe.name })}
          >
            <GripVertical aria-hidden="true" size={18} />
          </button>
        }
        actions={
          <button
            type="button"
            className="round-button"
            aria-pressed={selected}
            onClick={() => onAdd(recipe)}
          >
            {selected ? <X aria-hidden="true" size={18} /> : <Plus aria-hidden="true" size={18} />}
            <span className="visually-hidden">
              {selected ? t("common.cancel") : t("planner.addToPlan")} {t("planner.addToPlanTo", { name: recipe.name })}
            </span>
          </button>
        }
      />
    </div>
  );
}
