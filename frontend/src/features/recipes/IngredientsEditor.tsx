import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { splitPastedIngredients } from "./recipeFormLogic";

interface IngredientsEditorProps {
  rows: string[];
  onChange: (rows: string[]) => void;
  /** Id of the element describing an error; set as aria-describedby on the rows. */
  describedBy?: string | undefined;
  invalid?: boolean;
}

/**
 * One text row per ingredient. Enter adds a row below, pasting several lines splits them
 * into rows, and each row can be removed (the last remaining row is only cleared).
 */
export function IngredientsEditor({ rows, onChange, describedBy, invalid = false }: IngredientsEditorProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAfterRender = useRef<number | null>(null);

  useEffect(() => {
    if (focusAfterRender.current === null) return;
    inputs.current[focusAfterRender.current]?.focus();
    focusAfterRender.current = null;
  });

  const setRow = (index: number, value: string) =>
    onChange(rows.map((row, i) => (i === index ? value : row)));

  const insertAfter = (index: number, values: string[]) => {
    focusAfterRender.current = index + values.length;
    onChange([...rows.slice(0, index + 1), ...values, ...rows.slice(index + 1)]);
  };

  const remove = (index: number) => {
    if (rows.length === 1) {
      onChange([""]);
      inputs.current[0]?.focus();
      return;
    }
    focusAfterRender.current = Math.max(0, index - 1);
    onChange(rows.filter((_, i) => i !== index));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Enter") {
      event.preventDefault(); // never submits the form from an ingredient row
      insertAfter(index, [""]);
    } else if (event.key === "Backspace" && rows[index] === "" && rows.length > 1) {
      event.preventDefault();
      remove(index);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const lines = splitPastedIngredients(event.clipboardData.getData("text"));
    if (!lines) return;
    event.preventDefault();
    const [first = "", ...rest] = lines;
    const current = rows[index] ?? "";
    // A pasted list replaces an empty row; otherwise it goes into the rows below.
    if (current.trim() === "") {
      focusAfterRender.current = index + rest.length;
      onChange([...rows.slice(0, index), first, ...rest, ...rows.slice(index + 1)]);
    } else {
      insertAfter(index, lines);
    }
  };

  return (
    <ol className="ingredient-rows">
      {rows.map((row, index) => (
        <li key={index} className="ingredient-row">
          <input
            ref={(node) => {
              inputs.current[index] = node;
            }}
            type="text"
            value={row}
            aria-label={`Ingredient ${index + 1}`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={index === 0 ? "e.g. 200 g lentils" : ""}
            onChange={(event) => setRow(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPaste={(event) => onPaste(event, index)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ingredient ${index + 1}`}
            onClick={() => remove(index)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
      <li className="ingredient-add">
        <button type="button" className="btn" onClick={() => insertAfter(rows.length - 1, [""])}>
          <span aria-hidden="true">+ </span>Add ingredient
        </button>
      </li>
    </ol>
  );
}
