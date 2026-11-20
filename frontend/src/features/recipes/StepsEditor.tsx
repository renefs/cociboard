import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STEPS_MAX_COUNT, STEP_MAX_LENGTH } from "../../api/types";

interface StepsEditorProps {
  rows: string[];
  onChange: (rows: string[]) => void;
  /** Id of the element describing an error; set as aria-describedby on the rows. */
  describedBy?: string | undefined;
  invalid?: boolean;
}

/** What to focus once the next render has put the rows in their new order. */
type FocusTarget = { row: number; control: "textarea" | "up" | "down" | "add" };

/**
 * An ordered list of steps, one textarea each, with Move up, Move down and Remove buttons
 * (no dragging needed) and Add step. Focus follows the moved step, and after a removal goes
 * to the neighbouring step (or Add step when none is left). Changes are announced politely.
 */
export function StepsEditor({ rows, onChange, describedBy, invalid = false }: StepsEditorProps) {
  const { t } = useTranslation();
  const areas = useRef<(HTMLTextAreaElement | null)[]>([]);
  const ups = useRef<(HTMLButtonElement | null)[]>([]);
  const downs = useRef<(HTMLButtonElement | null)[]>([]);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useRef<FocusTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const target = focusAfterRender.current;
    if (!target) return;
    focusAfterRender.current = null;
    const element =
      target.control === "add"
        ? addButton.current
        : target.control === "textarea"
          ? areas.current[target.row]
          : (target.control === "up" ? ups : downs).current[target.row];
    element?.focus();
  });

  const setRow = (index: number, value: string) =>
    onChange(rows.map((row, i) => (i === index ? value : row)));

  const add = () => {
    focusAfterRender.current = { row: rows.length, control: "textarea" };
    onChange([...rows, ""]);
  };

  const remove = (index: number) => {
    const left = rows.length - 1;
    focusAfterRender.current =
      left === 0 ? { row: 0, control: "add" } : { row: Math.min(index, left - 1), control: "textarea" };
    setAnnouncement(t("recipeForm.stepRemoved", { n: index + 1 }));
    onChange(rows.filter((_, i) => i !== index));
  };

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target] ?? "", next[index] ?? ""];
    // Keep the focus on the same button, which now sits at the new position; at the ends the
    // button disables, so hand the focus to its opposite number.
    const atEnd = offset === -1 ? target === 0 : target === rows.length - 1;
    focusAfterRender.current = {
      row: target,
      control: atEnd ? (offset === -1 ? "down" : "up") : offset === -1 ? "up" : "down",
    };
    setAnnouncement(t("recipeForm.stepMoved", { n: target + 1, total: rows.length }));
    onChange(next);
  };

  return (
    <div className="steps-editor">
      <ol className="step-rows">
        {rows.map((row, index) => (
          <li key={index} className="step-row">
            <textarea
              ref={(node) => {
                areas.current[index] = node;
              }}
              rows={2}
              value={row}
              maxLength={STEP_MAX_LENGTH + 100}
              aria-label={t("recipeForm.stepN", { n: index + 1 })}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              placeholder={index === 0 ? t("recipeForm.stepExample") : ""}
              onChange={(event) => setRow(index, event.target.value)}
            />
            <div className="step-buttons">
              <button
                type="button"
                className="icon-button"
                ref={(node) => {
                  ups.current[index] = node;
                }}
                aria-label={t("recipeForm.moveStepUpN", { n: index + 1 })}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="icon-button"
                ref={(node) => {
                  downs.current[index] = node;
                }}
                aria-label={t("recipeForm.moveStepDownN", { n: index + 1 })}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t("recipeForm.removeStepN", { n: index + 1 })}
                onClick={() => remove(index)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn step-add"
        ref={addButton}
        disabled={rows.length >= STEPS_MAX_COUNT}
        onClick={add}
      >
        <span aria-hidden="true">+ </span>
        {t("recipeForm.addStep")}
      </button>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
