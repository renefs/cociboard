import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import { NOTE_MAX_LENGTH, type SlotRef } from "../../api/types";
import { Modal } from "./Modal";
import { capitalizeFirst, describeSlot, mealName, type SlotMeal } from "./slots";

interface SlotActionsProps {
  meal: SlotMeal;
  slot: SlotRef;
  onReplace: () => void;
  onRemove: () => void;
  /** Only offered for recipes. */
  onDetails: () => void;
  /** Only given when leftovers can be saved for the next meal (see `leftoversTarget`). */
  onLeftovers?: (() => void) | undefined;
  /** Save a note, or remove it with `null`. */
  onSaveNote: (note: string | null) => void;
  onClose: () => void;
}

/**
 * Actions for a filled slot: Replace, View details (recipes), Add or Edit note, Remove.
 * The note form replaces the action list inside the same dialog.
 */
export function SlotActions({
  meal,
  slot,
  onReplace,
  onRemove,
  onDetails,
  onLeftovers,
  onSaveNote,
  onClose,
}: SlotActionsProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meal.note ?? "");

  const title = mealName(meal, t);
  const where = capitalizeFirst(describeSlot(slot, t, locale), locale);

  if (editing) {
    const save = () => onSaveNote(draft.trim() === "" ? null : draft.trim());
    return (
      <Modal title={t(meal.note ? "planner.editNote" : "planner.addNote")} onClose={onClose} focusInput>
        <p className="status-message">
          {title}, {where}
        </p>
        <form
          className="note-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="note-field">
            {t("planner.noteLabel")}
            <input
              type="text"
              value={draft}
              maxLength={NOTE_MAX_LENGTH}
              placeholder={t("planner.notePlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
            />
            <span className="note-hint">{t("planner.noteHint", { max: NOTE_MAX_LENGTH })}</span>
          </label>
          <div className="action-list">
            <button type="submit" className="btn btn-large btn-primary">
              {t("planner.saveNote")}
            </button>
            {meal.note && (
              <button type="button" className="btn btn-large btn-danger" onClick={() => onSaveNote(null)}>
                {t("planner.removeNote")}
              </button>
            )}
            <button type="button" className="btn btn-large" onClick={() => setEditing(false)}>
              {t("common.back")}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="status-message">{where}</p>
      {meal.note && <p className="status-message">{t("planner.slotNote", { note: meal.note })}</p>}
      <div className="action-list">
        <button type="button" className="btn btn-large" onClick={onReplace}>
          {t("common.replace")}
        </button>
        {meal.kind === "recipe" && (
          <button type="button" className="btn btn-large" onClick={onDetails}>
            {t("planner.viewDetails")}
          </button>
        )}
        {onLeftovers && (
          <button type="button" className="btn btn-large" onClick={onLeftovers}>
            {t("planner.leftovers")}
          </button>
        )}
        <button type="button" className="btn btn-large" onClick={() => setEditing(true)}>
          {t(meal.note ? "planner.editNote" : "planner.addNote")}
        </button>
        <button type="button" className="btn btn-large btn-danger" onClick={onRemove}>
          {t("common.remove")}
        </button>
      </div>
    </Modal>
  );
}
