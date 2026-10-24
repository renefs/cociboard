import { useDraggable } from "@dnd-kit/core";
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
}

/** A compact recipe card for the panel: draggable, with an "Add" button for tap-to-place. */
export function DraggableRecipeCard({
  recipe,
  selected,
  onAdd,
  usageCount = 0,
  onOpen,
}: DraggableRecipeCardProps) {
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
        density="compact"
        usageCount={usageCount}
        onOpen={onOpen}
        actions={
          <span className="card-actions">
            <button
              type="button"
              className="icon-button drag-handle"
              ref={setActivatorNodeRef}
              {...attributes}
              aria-pressed={undefined}
              aria-label={`Drag ${recipe.name}. Press Space to pick up.`}
            >
              <span aria-hidden="true">⠿</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              aria-pressed={selected}
              onClick={() => onAdd(recipe)}
            >
              {selected ? "Cancel" : "Add"}
              {" "}
              <span className="visually-hidden">{recipe.name} to the plan</span>
            </button>
          </span>
        }
      />
    </div>
  );
}
