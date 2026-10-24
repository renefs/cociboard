import type { Recipe, SlotRef } from "../../api/types";
import { Modal } from "./Modal";
import { describeSlot } from "./slots";

interface SlotActionsProps {
  recipe: Recipe;
  slot: SlotRef;
  onReplace: () => void;
  onRemove: () => void;
  onDetails: () => void;
  onClose: () => void;
}

/** Actions for a filled slot: Replace, View details, Remove. */
export function SlotActions({ recipe, slot, onReplace, onRemove, onDetails, onClose }: SlotActionsProps) {
  return (
    <Modal title={recipe.name} onClose={onClose}>
      <p className="status-message">{describeSlot(slot)}</p>
      <div className="action-list">
        <button type="button" className="btn btn-large" onClick={onReplace}>
          Replace
        </button>
        <button type="button" className="btn btn-large" onClick={onDetails}>
          View details
        </button>
        <button type="button" className="btn btn-large btn-danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </Modal>
  );
}
