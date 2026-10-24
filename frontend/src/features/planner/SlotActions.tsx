import { useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import type { Recipe, SlotRef } from "../../api/types";
import { Modal } from "./Modal";
import { capitalizeFirst, describeSlot } from "./slots";

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
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <Modal title={recipe.name} onClose={onClose}>
      <p className="status-message">{capitalizeFirst(describeSlot(slot, t, locale), locale)}</p>
      <div className="action-list">
        <button type="button" className="btn btn-large" onClick={onReplace}>
          {t("common.replace")}
        </button>
        <button type="button" className="btn btn-large" onClick={onDetails}>
          {t("planner.viewDetails")}
        </button>
        <button type="button" className="btn btn-large btn-danger" onClick={onRemove}>
          {t("common.remove")}
        </button>
      </div>
    </Modal>
  );
}
