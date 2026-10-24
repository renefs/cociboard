import { useState } from "react";
import type { Recipe, SlotRef } from "../../api/types";
import { RecipeCard } from "../recipes/RecipeCard";
import { Modal } from "./Modal";
import { describeSlot } from "./slots";

interface SlotActionsProps {
  recipe: Recipe;
  slot: SlotRef;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Actions for a filled slot: Replace, Remove, View details. */
export function SlotActions({ recipe, slot, onReplace, onRemove, onClose }: SlotActionsProps) {
  const [view, setView] = useState<"menu" | "details">("menu");
  return (
    <Modal title={view === "menu" ? recipe.name : `${recipe.name} details`} onClose={onClose}>
      {view === "menu" ? (
        <>
          <p className="status-message">{describeSlot(slot)}</p>
          <div className="action-list">
            <button type="button" className="btn btn-large" onClick={onReplace}>
              Replace
            </button>
            <button type="button" className="btn btn-large" onClick={() => setView("details")}>
              View details
            </button>
            <button type="button" className="btn btn-large btn-danger" onClick={onRemove}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <>
          <RecipeCard recipe={recipe} />
          <button type="button" className="btn btn-large" onClick={() => setView("menu")}>
            Back
          </button>
        </>
      )}
    </Modal>
  );
}
