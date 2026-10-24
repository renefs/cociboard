import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  MEAL_TYPES,
  PROTEINS,
  RECIPE_PROPERTIES,
  type MealType,
  type MealTypeConflictDetail,
  type Protein,
  type Recipe,
  type RecipeProperty,
} from "../../api/types";
import { ApiError } from "../../api/client";
import { IngredientsEditor } from "./IngredientsEditor";
import {
  NAME_MAX,
  asMealTypeConflict,
  describeConflict,
  emptyValues,
  isDuplicateNameError,
  mapValidationErrors,
  toPayload,
  validateValues,
  valuesFromRecipe,
  type FormErrors,
  type FormField,
  type RecipeFormValues,
} from "./recipeFormLogic";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";
import { useCreateRecipe, useUpdateRecipe } from "./useRecipeMutations";

export interface SavedInfo {
  recipe: Recipe;
  created: boolean;
  /** Planned meals removed because of a meal-type change. */
  removedMeals: number;
}

interface RecipeFormProps {
  /** The recipe to edit; omit to create a new one. */
  recipe?: Recipe | undefined;
  onSaved: (info: SavedInfo) => void;
  onCancel: () => void;
}

const MEAL_TYPE_HINT: Record<MealType, string> = {
  lunch: "Only fits lunch slots",
  dinner: "Only fits dinner slots",
  both: "Fits lunch and dinner slots",
};

export function RecipeForm({ recipe, onSaved, onCancel }: RecipeFormProps) {
  const editing = recipe !== undefined;
  const [values, setValues] = useState<RecipeFormValues>(() =>
    recipe ? valuesFromRecipe(recipe) : emptyValues(),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<MealTypeConflictDetail | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ids = { name: useId(), minutes: useId(), description: useId(), ingredients: useId(), protein: useId() };

  const create = useCreateRecipe();
  const update = useUpdateRecipe();
  const saving = create.isPending || update.isPending;

  const set = <K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    const field = key as FormField;
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (key === "mealType") setConflict(null);
  };

  const focusField = (field: FormField) => {
    const selector: Partial<Record<FormField, string>> = {
      name: `[id="${ids.name}"]`,
      prepMinutes: `[id="${ids.minutes}"]`,
      ingredients: ".ingredient-row input",
    };
    const target = selector[field];
    if (target) formRef.current?.querySelector<HTMLElement>(target)?.focus();
  };

  const showErrors = (next: FormErrors) => {
    setErrors(next);
    const first = (["name", "prepMinutes", "ingredients"] as const).find((field) => next[field]);
    if (first) focusField(first);
  };

  const submit = async (force: boolean) => {
    setFormError(null);
    const found = validateValues(values);
    if (Object.values(found).some(Boolean)) {
      showErrors(found);
      return;
    }
    const payload = toPayload(values);
    try {
      if (recipe) {
        const before = conflict?.conflicts.length ?? 0;
        const saved = await update.mutateAsync({ id: recipe.id, changes: payload, force });
        onSaved({ recipe: saved, created: false, removedMeals: force ? before : 0 });
      } else {
        onSaved({ recipe: await create.mutateAsync(payload), created: true, removedMeals: 0 });
      }
    } catch (error) {
      handleError(error);
    }
  };

  const handleError = (error: unknown) => {
    const planned = asMealTypeConflict(error);
    if (planned) {
      setConflict(planned);
      return;
    }
    if (isDuplicateNameError(error)) {
      showErrors({ name: "Another recipe already has this name." });
      return;
    }
    if (error instanceof ApiError && error.status === 422) {
      const { fields, other } = mapValidationErrors(error.detail);
      if (Object.keys(fields).length > 0) showErrors(fields);
      if (other.length > 0 || Object.keys(fields).length === 0) {
        setFormError(other.join(" ") || "Some values are not valid. Please check the form.");
      }
      return;
    }
    if (error instanceof ApiError && error.status === 404) {
      setFormError("This recipe no longer exists. Close this dialog and refresh the list.");
      return;
    }
    setFormError("Couldn't save the recipe. Check your connection and try again.");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!saving) void submit(false);
  };

  const toggleProperty = (property: RecipeProperty) =>
    set(
      "properties",
      values.properties.includes(property)
        ? values.properties.filter((p) => p !== property)
        : [...values.properties, property],
    );

  const nameErrorId = `${ids.name}-error`;
  const minutesErrorId = `${ids.minutes}-error`;
  const ingredientsErrorId = `${ids.ingredients}-error`;

  return (
    <form className="recipe-form" ref={formRef} onSubmit={onSubmit} noValidate>
      <div className="form-body">
        <div className="field">
          <label htmlFor={ids.name}>
            Name <span className="required">(required)</span>
          </label>
          <input
            id={ids.name}
            type="text"
            value={values.name}
            maxLength={NAME_MAX + 20}
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? nameErrorId : undefined}
            onChange={(event) => set("name", event.target.value)}
          />
          <FieldError id={nameErrorId} message={errors.name} />
        </div>

        <fieldset className="field">
          <legend>Meal type</legend>
          <div className="segmented" role="radiogroup" aria-label="Meal type">
            {MEAL_TYPES.map((type) => (
              <label key={type} className="segment">
                <input
                  type="radio"
                  name="meal-type"
                  value={type}
                  checked={values.mealType === type}
                  onChange={() => set("mealType", type)}
                />
                <span className="segment-face">
                  <span aria-hidden="true">{MEAL_TYPE_META[type].icon}</span>{" "}
                  {type === "both" ? "Both" : MEAL_TYPE_META[type].label}
                </span>
              </label>
            ))}
          </div>
          <p className="field-hint">{MEAL_TYPE_HINT[values.mealType]}</p>
        </fieldset>

        {conflict && recipe && (
          <MealTypeConflictPanel
            detail={conflict}
            saving={saving}
            onForce={() => void submit(true)}
            onDismiss={() => setConflict(null)}
          />
        )}

        <div className="field-row">
          <div className="field">
            <label htmlFor={ids.protein}>Main protein</label>
            <select
              id={ids.protein}
              value={values.protein}
              onChange={(event) => set("protein", event.target.value as Protein)}
            >
              {PROTEINS.map((protein) => (
                <option key={protein} value={protein}>
                  {PROTEIN_META[protein].icon} {PROTEIN_META[protein].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.minutes}>Prep time (minutes)</label>
            <input
              id={ids.minutes}
              type="text"
              inputMode="numeric"
              value={values.prepMinutes}
              placeholder="optional"
              autoComplete="off"
              aria-invalid={errors.prepMinutes ? true : undefined}
              aria-describedby={errors.prepMinutes ? minutesErrorId : undefined}
              onChange={(event) => set("prepMinutes", event.target.value)}
            />
            <FieldError id={minutesErrorId} message={errors.prepMinutes} />
          </div>
        </div>

        <div className="field">
          <label htmlFor={ids.description}>Description</label>
          <textarea
            id={ids.description}
            rows={3}
            value={values.description}
            placeholder="optional: notes, steps or a source"
            onChange={(event) => set("description", event.target.value)}
          />
        </div>

        <fieldset className="field" aria-describedby={errors.ingredients ? ingredientsErrorId : undefined}>
          <legend>
            Ingredients <span className="required">(at least one)</span>
          </legend>
          <p className="field-hint">Press Enter for a new row, or paste a list to split it.</p>
          <IngredientsEditor
            rows={values.ingredients}
            onChange={(rows) => set("ingredients", rows)}
            describedBy={errors.ingredients ? ingredientsErrorId : undefined}
            invalid={Boolean(errors.ingredients)}
          />
          <FieldError id={ingredientsErrorId} message={errors.ingredients} />
        </fieldset>

        <fieldset className="field">
          <legend>Properties</legend>
          <div className="chip-group">
            {RECIPE_PROPERTIES.map((property) => (
              <button
                key={property}
                type="button"
                className="chip"
                aria-pressed={values.properties.includes(property)}
                onClick={() => toggleProperty(property)}
              >
                <span aria-hidden="true">{PROPERTY_META[property].icon}</span> {PROPERTY_META[property].label}
              </button>
            ))}
          </div>
        </fieldset>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-large" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-large" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create recipe"}
        </button>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return (
    <p id={id} className="field-error" role={message ? "alert" : undefined} hidden={!message}>
      {message}
    </p>
  );
}

interface ConflictPanelProps {
  detail: MealTypeConflictDetail;
  saving: boolean;
  onForce: () => void;
  onDismiss: () => void;
}

function MealTypeConflictPanel({ detail, saving, onForce, onDismiss }: ConflictPanelProps) {
  const count = detail.conflicts.length;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Bring the choice into view and let keyboard users land on it.
    panel.current?.focus();
    if (typeof panel.current?.scrollIntoView === "function") {
      panel.current.scrollIntoView({ block: "nearest" });
    }
  }, []);
  return (
    <div className="conflict-panel" role="alert" tabIndex={-1} ref={panel}>
      <p>
        <strong>
          This recipe is planned in {count} {count === 1 ? "slot" : "slots"} that no longer fit the
          new meal type:
        </strong>
      </p>
      <ul>
        {detail.conflicts.map((c) => (
          <li key={`${c.week_start}-${c.day}-${c.slot}`}>{describeConflict(c)}</li>
        ))}
      </ul>
      <div className="conflict-actions">
        <button type="button" className="btn btn-danger" disabled={saving} onClick={onForce}>
          Remove them and save
        </button>
        <button type="button" className="btn" disabled={saving} onClick={onDismiss}>
          Keep editing
        </button>
      </div>
    </div>
  );
}
