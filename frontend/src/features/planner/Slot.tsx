import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { MealSlot, Recipe, WeekPlan } from "../../api/types";
import { MetaIcon } from "../recipes/MetaIcon";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "../recipes/recipeMeta";
import { canDrop, isDragSource, slotDragId, slotDropId, type DragSource, type DropTarget } from "./dragLogic";
import { fitsSlot, sameSlot, slotHint, slotLabel } from "./slots";
import { dayName } from "./weekMath";

interface SlotProps {
  day: number;
  slot: MealSlot;
  recipe: Recipe | null;
  plan: WeekPlan;
  /** The recipe being placed in tap-to-place ("select") mode, if any. */
  selecting: Recipe | null;
  /** Tap on an empty slot, a filled slot, or (in select mode) a target slot. */
  onActivate: (day: number, slot: MealSlot) => void;
  onRemove: (day: number, slot: MealSlot) => void;
}

export function Slot({ day, slot, recipe, plan, selecting, onActivate, onRemove }: SlotProps) {
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
    disabled: dragBlocked || isOwnSlot,
  });

  const hint = dragBlocked && source ? slotHint(source.recipe, slot) : selectBlocked && selecting ? slotHint(selecting, slot) : null;
  const classes = [
    "slot",
    recipe ? "slot--filled" : "slot--empty",
    source && dragAllowed ? "slot--drop-ok" : "",
    source && dragAllowed && isOver ? "slot--over" : "",
    dragBlocked || selectBlocked ? "slot--blocked" : "",
    selecting && selectAllowed ? "slot--select-ok" : "",
    selecting && selectAllowed && !recipe ? "slot--pulse" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={classes}
      role="group"
      aria-label={`${dayName(day)} ${slot}`}
      data-select-target={selecting && selectAllowed ? "true" : undefined}
    >
      <span className="slot-label">{slotLabel(slot)}</span>
      {recipe ? (
        <FilledSlot
          day={day}
          slot={slot}
          recipe={recipe}
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
          <span aria-hidden="true">+</span> Add {slot}{" "}
          <span className="visually-hidden">on {dayName(day)}</span>
        </button>
      )}
      {hint && recipe && (
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
  recipe: Recipe;
  selecting: boolean;
  disabled: boolean;
  onActivate: (day: number, slot: MealSlot) => void;
  onRemove: (day: number, slot: MealSlot) => void;
}

function FilledSlot({ day, slot, recipe, selecting, disabled, onActivate, onRemove }: FilledSlotProps) {
  const source: DragSource = { kind: "slot", recipe, from: { day, slot } };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: slotDragId({ day, slot }),
    data: source,
    disabled: selecting,
  });
  const meal = MEAL_TYPE_META[recipe.meal_type];
  const protein = PROTEIN_META[recipe.protein];
  const where = `${dayName(day)} ${slot}`;

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
        aria-label={`${recipe.name}, ${where}. Enter for actions, Space to pick up and move.`}
        disabled={disabled}
        onClick={() => onActivate(day, slot)}
      >
        <span className="slot-name">{recipe.name}</span>
        <span className="slot-icons">
          <MetaIcon meta={meal} />
          <span className="slot-protein" aria-hidden="true">
            {protein.icon}
          </span>
          {recipe.properties.map((property) => (
            <MetaIcon key={property} meta={PROPERTY_META[property]} />
          ))}
        </span>
      </button>
      <button
        type="button"
        className="slot-remove"
        aria-label={`Remove ${recipe.name} from ${where}`}
        disabled={selecting}
        onClick={() => onRemove(day, slot)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
