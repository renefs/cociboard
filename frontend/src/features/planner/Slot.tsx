import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import type { MealSlot, Recipe, WeekPlan } from "../../api/types";
import { MetaIcon } from "../recipes/MetaIcon";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "../recipes/recipeMeta";
import {
  acceptsDrop,
  canDrop,
  isDragSource,
  slotDragId,
  slotDropId,
  sourceRecipe,
  type DragSource,
  type DropTarget,
} from "./dragLogic";
import { SPECIAL_META } from "./specialMeta";
import {
  dayParams,
  describeSlot,
  fitsSlot,
  mealName,
  sameSlot,
  slotHint,
  slotLabel,
  type SlotMeal,
} from "./slots";

/** Seed recipe names are Spanish; the language drives automatic hyphenation of long names. */
const RECIPE_LANG = "es";

interface SlotProps {
  day: number;
  slot: MealSlot;
  /** A recipe or a special meal with its note; `null` for an empty slot. */
  meal: SlotMeal | null;
  plan: WeekPlan;
  /** The recipe being placed in tap-to-place ("select") mode, if any. */
  selecting: Recipe | null;
  /** Tap on an empty slot, a filled slot, or (in select mode) a target slot. */
  onActivate: (day: number, slot: MealSlot) => void;
  onRemove: (day: number, slot: MealSlot) => void;
  /** Messages of the variety warnings this slot takes part in. */
  warnings?: readonly string[];
  /** Whether the slot belongs to the variety issue chosen in the summary. */
  highlighted?: boolean;
}

export function Slot({
  day,
  slot,
  meal,
  plan,
  selecting,
  onActivate,
  onRemove,
  warnings = [],
  highlighted = false,
}: SlotProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { active } = useDndContext();
  const raw: unknown = active?.data.current;
  const source: DragSource | null = isDragSource(raw) ? raw : null;
  const ref = { day, slot };
  const target: DropTarget = { kind: "slot", day, slot };

  const isOwnSlot = source?.kind === "slot" && sameSlot(source.from, ref);
  const dragAllowed = source ? canDrop(plan, source, target) : false;
  const dragBlocked = source !== null && !dragAllowed && !isOwnSlot;
  const selectAllowed = selecting ? fitsSlot(selecting.meal_type, slot) : false;
  const selectBlocked = selecting !== null && !selectAllowed;

  const { setNodeRef, isOver } = useDroppable({
    id: slotDropId(ref),
    data: target,
    disabled: !acceptsDrop(plan, source, target),
  });

  const dragRecipe = source ? sourceRecipe(source) : null;
  const hint =
    dragBlocked && dragRecipe
      ? slotHint(dragRecipe, slot, t)
      : selectBlocked && selecting
        ? slotHint(selecting, slot, t)
        : null;
  const classes = [
    "slot",
    meal ? "slot--filled" : "slot--empty",
    meal?.kind === "special" ? "slot--special" : "",
    source && dragAllowed ? "slot--drop-ok" : "",
    source && dragAllowed && isOver ? "slot--over" : "",
    dragBlocked || selectBlocked ? "slot--blocked" : "",
    selecting && selectAllowed ? "slot--select-ok" : "",
    selecting && selectAllowed && !meal ? "slot--pulse" : "",
    warnings.length > 0 ? "slot--warning" : "",
    highlighted ? "slot--highlight" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={classes}
      role="group"
      aria-label={describeSlot(ref, t, locale)}
      data-select-target={selecting && selectAllowed ? (meal ? "true" : "empty") : undefined}
    >
      <div className="slot-head">
        <span className="slot-label">{slotLabel(slot, t)}</span>
        {warnings.length > 0 && (
          <span className="slot-warning" title={warnings.join("\n")}>
            <span aria-hidden="true">⚠</span>
            <span className="visually-hidden">{t("planner.varietyWarning", { messages: warnings.join(" ") })}</span>
          </span>
        )}
      </div>
      {meal ? (
        <FilledSlot
          day={day}
          slot={slot}
          meal={meal}
          selecting={selecting !== null}
          disabled={selectBlocked}
          onActivate={onActivate}
          onRemove={onRemove}
        />
      ) : hint ? (
        <div className="slot-add slot-add--blocked">
          <span className="slot-hint" data-testid="slot-hint">
            {hint}
          </span>
        </div>
      ) : (
        <button type="button" className="slot-add" onClick={() => onActivate(day, slot)}>
          <span aria-hidden="true">+</span> {t(`planner.addSlot.${slot}`)}{" "}
          <span className="visually-hidden">{t("planner.onDay", dayParams(day, locale))}</span>
        </button>
      )}
      {hint && meal && (
        <span className="slot-hint slot-hint--overlay" data-testid="slot-hint">
          {hint}
        </span>
      )}
    </div>
  );
}

interface FilledSlotProps {
  day: number;
  slot: MealSlot;
  meal: SlotMeal;
  selecting: boolean;
  disabled: boolean;
  onActivate: (day: number, slot: MealSlot) => void;
  onRemove: (day: number, slot: MealSlot) => void;
}

function FilledSlot({ day, slot, meal, selecting, disabled, onActivate, onRemove }: FilledSlotProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const source: DragSource = { kind: "slot", meal, from: { day, slot } };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: slotDragId({ day, slot }),
    data: source,
    disabled: selecting,
  });
  const name = mealName(meal, t);
  const where = describeSlot({ day, slot }, t, locale);
  // The name, the "Archived" mark and the note are all visible inside the button, so the
  // accessible name contains them in that order (WCAG 2.5.3, Label in Name).
  const note = meal.note ?? "";
  let key: "slotSpecial" | "slotRecipe" | "slotRecipeArchived" | "slotSpecialNote" | "slotRecipeNote" | "slotRecipeArchivedNote";
  if (meal.kind === "special") key = note ? "slotSpecialNote" : "slotSpecial";
  else if (meal.recipe.archived) key = note ? "slotRecipeArchivedNote" : "slotRecipeArchived";
  else key = note ? "slotRecipeNote" : "slotRecipe";
  const label = t(`planner.${key}`, { name, note, where });

  return (
    <div
      className={isDragging ? "slot-recipe is-dragging" : "slot-recipe"}
      ref={setNodeRef}
      {...listeners}
    >
      <button
        type="button"
        className="slot-body"
        ref={setActivatorNodeRef}
        {...attributes}
        aria-pressed={undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => onActivate(day, slot)}
      >
        {meal.kind === "recipe" ? (
          <RecipeBody recipe={meal.recipe} />
        ) : (
          <span className="slot-name slot-special" title={name}>
            <span aria-hidden="true">{SPECIAL_META[meal.special].icon}</span> {name}
          </span>
        )}
        {/* The spaces between the parts of the button are ignored by the flex layout; they keep
            the words apart when the visible text is extracted (WCAG 2.5.3 checks). */}
        {meal.note && " "}
        {meal.note && (
          <span className="slot-note" title={meal.note} aria-hidden="true">
            {meal.note}
          </span>
        )}
      </button>
      <button
        type="button"
        className="slot-remove"
        aria-label={t(`planner.removeFrom.${slot}`, { name, ...dayParams(day, locale) })}
        disabled={selecting}
        onClick={() => onRemove(day, slot)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

function RecipeBody({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const meal = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];
  return (
    <>
      <span className="slot-name" lang={RECIPE_LANG} title={recipe.name}>
        {recipe.name}
      </span>{" "}
      {recipe.archived && (
        <>
          <span className="slot-archived" aria-hidden="true">
            {t("planner.archivedMark")}
          </span>{" "}
        </>
      )}
      <span className="slot-icons">
        <MetaIcon meta={meal} />
        <span className="slot-protein" aria-hidden="true">
          {protein.icon}
        </span>
        {recipe.properties.map((property) => (
          <MetaIcon key={property} meta={PROPERTY_META[property]} />
        ))}
      </span>
    </>
  );
}
