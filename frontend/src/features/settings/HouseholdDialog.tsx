import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DIETARY_PROPERTIES, RECIPE_PROPERTIES, type HouseholdSettings, type RecipeProperty } from "../../api/types";
import { Modal } from "../planner/Modal";
import { PROPERTY_META } from "../recipes/recipeMeta";
import {
  TARGET_LIMITS,
  draftToSettings,
  isChanged,
  stepTarget,
  toDraft,
  toggleAvoided,
  toggleRequired,
  validateDraft,
  type HouseholdDraft,
  type TargetField,
  type TimeField,
} from "./householdLogic";
import { useHouseholdSettings } from "./useHouseholdSettings";

interface HouseholdDialogProps {
  onClose: () => void;
  /** Called with the new settings when Save is pressed; the dialog closes right after. */
  onSave: (settings: HouseholdSettings) => void;
}

const TARGET_FIELDS = [
  { field: "max_meals_per_protein", labelKey: "household.maxProtein", hintKey: "household.maxProteinHint" },
  { field: "min_vegetarian_meals", labelKey: "household.minVegetarian", hintKey: "household.minVegetarianHint" },
  { field: "min_fish_meals", labelKey: "household.minFish", hintKey: "household.minFishHint" },
] as const satisfies readonly { field: TargetField; labelKey: string; hintKey: string }[];

const TIME_FIELDS = [
  { field: "lunch_time", labelKey: "household.lunchTime" },
  { field: "dinner_time", labelKey: "household.dinnerTime" },
] as const satisfies readonly { field: TimeField; labelKey: string }[];

/** The "Household preferences" dialog: diet, avoided tags, variety targets and meal times. */
export function HouseholdDialog({ onClose, onSave }: HouseholdDialogProps) {
  const { t } = useTranslation();
  const query = useHouseholdSettings();
  return (
    <Modal title={t("household.title")} onClose={onClose} closeOnBackdrop={false}>
      {query.isPending && <p role="status">{t("household.loading")}</p>}
      {query.isError && (
        <div className="state-box" role="alert">
          <p>{t("household.loadError")}</p>
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {query.data && <HouseholdForm saved={query.data} onCancel={onClose} onSave={onSave} />}
    </Modal>
  );
}

interface HouseholdFormProps {
  saved: HouseholdSettings;
  onCancel: () => void;
  onSave: (settings: HouseholdSettings) => void;
}

function HouseholdForm({ saved, onCancel, onSave }: HouseholdFormProps) {
  const { t } = useTranslation();
  const ids = useId();
  const [draft, setDraft] = useState<HouseholdDraft>(() => toDraft(saved));
  const errors = validateDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const canSave = valid && isChanged(draft, saved);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const settings = draftToSettings(draft);
    if (settings && canSave) onSave(settings);
  };

  const label = (property: RecipeProperty) => (
    <>
      <span aria-hidden="true">{PROPERTY_META[property].icon}</span> {t(PROPERTY_META[property].labelKey)}
    </>
  );

  return (
    <form className="household-form" onSubmit={submit} noValidate>
      <fieldset className="field">
        <legend>{t("household.dietHeading")}</legend>
        <p className="field-hint" id={`${ids}-diet`}>
          {t("household.dietHelp")}
        </p>
        <div className="checkbox-list" aria-describedby={`${ids}-diet`}>
          {DIETARY_PROPERTIES.map((property) => (
            <label key={property} className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.required.includes(property)}
                onChange={() => setDraft(toggleRequired(draft, property))}
              />
              <span>{label(property)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{t("household.avoidHeading")}</legend>
        <p className="field-hint" id={`${ids}-avoid`}>
          {t("household.avoidHelp")}
        </p>
        <div className="checkbox-list" aria-describedby={`${ids}-avoid`}>
          {RECIPE_PROPERTIES.map((property) => {
            const required = draft.required.includes(property);
            return (
              <label key={property} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.avoided.includes(property)}
                  disabled={required}
                  onChange={() => setDraft(toggleAvoided(draft, property))}
                />
                <span>
                  {label(property)}
                  {required && <span className="checkbox-note"> {t("household.requiredInDiet")}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{t("household.varietyHeading")}</legend>
        <p className="field-hint">{t("household.varietyHelp")}</p>
        {TARGET_FIELDS.map(({ field, labelKey, hintKey }) => {
          const inputId = `${ids}-${field}`;
          const error = errors[field];
          const { min, max } = TARGET_LIMITS[field];
          const name = t(labelKey);
          return (
            <div className="field target-field" key={field}>
              <label htmlFor={inputId}>{name}</label>
              <div className="stepper">
                <button
                  type="button"
                  className="btn stepper-button"
                  aria-label={t("household.decrease", { name })}
                  onClick={() => setDraft({ ...draft, [field]: stepTarget(field, draft[field], -1) })}
                >
                  <span aria-hidden="true">−</span>
                </button>
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  step={1}
                  value={draft[field]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
                <button
                  type="button"
                  className="btn stepper-button"
                  aria-label={t("household.increase", { name })}
                  onClick={() => setDraft({ ...draft, [field]: stepTarget(field, draft[field], 1) })}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              <p className="field-hint" id={`${inputId}-hint`}>
                {t(hintKey)}
              </p>
              <p id={`${inputId}-error`} className="field-error" role={error ? "alert" : undefined} hidden={!error}>
                {error && t("household.errors.range", { min, max })}
              </p>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="field">
        <legend>{t("household.timesHeading")}</legend>
        <p className="field-hint">{t("household.timesHelp")}</p>
        <div className="field-row">
          {TIME_FIELDS.map(({ field, labelKey }) => {
            const inputId = `${ids}-${field}`;
            const error = errors[field];
            return (
              <div className="field" key={field}>
                <label htmlFor={inputId}>{t(labelKey)}</label>
                <input
                  id={inputId}
                  type="time"
                  value={draft[field]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${inputId}-error` : undefined}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
                <p id={`${inputId}-error`} className="field-error" role={error ? "alert" : undefined} hidden={!error}>
                  {error && t("household.errors.time")}
                </p>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn btn-large" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary btn-large" disabled={!canSave}>
          {t("household.save")}
        </button>
      </div>
    </form>
  );
}
