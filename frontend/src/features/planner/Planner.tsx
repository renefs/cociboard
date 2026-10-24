import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  TouchSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MealSlot, Recipe, WeekPlan } from "../../api/types";
import { RecipePanel } from "../recipes/RecipePanel";
import { MEAL_TYPE_META } from "../recipes/recipeMeta";
import { DraggableRecipeCard } from "./DraggableRecipeCard";
import {
  PANEL_DROP_ID,
  announceCancel,
  announceEnd,
  announceOver,
  announceStart,
  handleDragEnd,
  isDragSource,
  isDropTarget,
  type DragSource,
} from "./dragLogic";
import { keyboardCoordinates } from "./keyboardNavigation";
import { RecipePicker } from "./RecipePicker";
import { MouseAndPenSensor, POINTER_ACTIVATION, TOUCH_ACTIVATION, collisionDetection } from "./sensors";
import { SlotActions } from "./SlotActions";
import { describeSlot, fitsSlot, recipeAt } from "./slots";
import { Toast, type ToastMessage } from "./Toast";
import { usePlanActions, useWeekPlan } from "./useWeekPlan";
import { dayName, formatWeekRange, weekStartOf } from "./weekMath";
import { WeekGrid } from "./WeekGrid";

type Ui =
  | { kind: "none" }
  | { kind: "picker"; day: number; slot: MealSlot }
  | { kind: "actions"; day: number; slot: MealSlot };

const SCREEN_READER: ScreenReaderInstructions = {
  draggable:
    "To pick up a recipe, press Space. Use the arrow keys to jump between slots, Space to drop it and Escape to cancel.",
};

interface PlannerProps {
  /** Current time; injectable for tests. */
  now?: Date;
}

export function Planner({ now: nowProp }: PlannerProps) {
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const weekStart = weekStartOf(now);
  const { data: plan, isPending, isError, refetch } = useWeekPlan(weekStart);

  const [ui, setUi] = useState<Ui>({ kind: "none" });
  const [selecting, setSelecting] = useState<Recipe | null>(null);
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);

  const notify = useCallback((kind: ToastMessage["kind"], text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, kind, text });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const actions = usePlanActions(weekStart, (message) => notify("error", message));

  const sensors = useSensors(
    useSensor(MouseAndPenSensor, { activationConstraint: POINTER_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Space picks up and drops; Enter stays free for "open actions" on slot buttons.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  // Escape leaves select mode.
  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelecting(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  // Bring the first valid target into view when select mode starts (matters on mobile,
  // where the recipes are below the grid).
  useEffect(() => {
    if (!selecting) return;
    const target = document.querySelector<HTMLElement>('[data-select-target="true"]');
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selecting]);

  const place = (recipe: Recipe, day: number, slot: MealSlot) => {
    actions.assign({ day, slot }, recipe);
    notify("info", `Added ${recipe.name} to ${describeSlot({ day, slot })}.`);
  };

  const onActivate = (day: number, slot: MealSlot) => {
    if (selecting) {
      if (fitsSlot(selecting.meal_type, slot)) {
        place(selecting, day, slot);
        setSelecting(null);
      }
      return;
    }
    const filled = plan ? recipeAt(plan, { day, slot }) : null;
    setUi(filled ? { kind: "actions", day, slot } : { kind: "picker", day, slot });
  };

  const toggleSelect = (recipe: Recipe) =>
    setSelecting((current) => (current?.id === recipe.id ? null : recipe));

  const sourceOf = (data: unknown) => (isDragSource(data) ? data : null);

  const onDragStart = ({ active }: DragStartEvent) => {
    setSelecting(null);
    setDragging(sourceOf(active.data.current));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const overData: unknown = over?.data.current;
    const action = plan
      ? handleDragEnd(plan, sourceOf(active.data.current), isDropTarget(overData) ? overData : null)
      : null;
    if (!action) return;
    if (action.type === "assign") actions.assign(action.to, action.recipe);
    else if (action.type === "move") actions.move(action.from, action.to);
    else actions.clear(action.from);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const source = sourceOf(active.data.current);
      return source ? announceStart(source) : undefined;
    },
    onDragOver: ({ active, over }: DragOverEvent) => {
      const source = sourceOf(active.data.current);
      const data: unknown = over?.data.current;
      if (!source || !plan) return undefined;
      return announceOver(plan, source, isDropTarget(data) ? data : null);
    },
    onDragEnd: ({ active, over }) => {
      const source = sourceOf(active.data.current);
      const data: unknown = over?.data.current;
      if (!source || !plan) return undefined;
      return announceEnd(plan, source, isDropTarget(data) ? data : null);
    },
    onDragCancel: ({ active }) => {
      const source = sourceOf(active.data.current);
      return source ? announceCancel(source) : undefined;
    },
  };

  const closeUi = () => setUi({ kind: "none" });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER }}
    >
      <div className="planner-layout">
        <section className="planner" aria-labelledby="planner-heading">
          <header className="planner-head">
            <h2 id="planner-heading">Weekly planner</h2>
            <p className="week-range">Week of {formatWeekRange(weekStart)}</p>
          </header>

          {selecting && (
            <div className="select-banner" role="status">
              <span>
                Choose a slot for <strong>{selecting.name}</strong>
              </span>
              <button type="button" className="btn" onClick={() => setSelecting(null)}>
                Cancel
              </button>
            </div>
          )}

          {plan ? (
            <WeekGrid
              plan={plan}
              now={now}
              selecting={selecting}
              onActivate={onActivate}
              onRemove={(day, slot) => actions.clear({ day, slot })}
            />
          ) : isError ? (
            <p className="status-message" role="alert">
              Could not load the week.{" "}
              <button type="button" className="link-button" onClick={() => void refetch()}>
                Retry
              </button>
            </p>
          ) : (
            isPending && <p className="status-message">Loading the week…</p>
          )}
        </section>

        <RecipeArea>
          <RecipePanel
            density="compact"
            renderCard={(recipe) => (
              <DraggableRecipeCard
                recipe={recipe}
                selected={selecting?.id === recipe.id}
                onAdd={toggleSelect}
              />
            )}
          />
        </RecipeArea>
      </div>

      <DragOverlay>{dragging ? <DragChip recipe={dragging.recipe} /> : null}</DragOverlay>

      {ui.kind === "picker" && (
        <RecipePicker
          title={`${plan && recipeAt(plan, ui) ? "Replace" : "Add"} ${ui.slot} on ${dayName(ui.day)}`}
          slot={ui.slot}
          onClose={closeUi}
          onPick={(recipe) => {
            place(recipe, ui.day, ui.slot);
            closeUi();
          }}
        />
      )}
      {ui.kind === "actions" && plan && <ActionsFor plan={plan} ui={ui} actions={actions} setUi={setUi} />}

      <Toast toast={toast} onDismiss={dismissToast} />
    </DndContext>
  );
}

interface ActionsForProps {
  plan: WeekPlan;
  ui: { day: number; slot: MealSlot };
  actions: ReturnType<typeof usePlanActions>;
  setUi: (ui: Ui) => void;
}

function ActionsFor({ plan, ui, actions, setUi }: ActionsForProps) {
  const recipe = recipeAt(plan, ui);
  if (!recipe) return null;
  return (
    <SlotActions
      recipe={recipe}
      slot={ui}
      onClose={() => setUi({ kind: "none" })}
      onReplace={() => setUi({ kind: "picker", day: ui.day, slot: ui.slot })}
      onRemove={() => {
        actions.clear(ui);
        setUi({ kind: "none" });
      }}
    />
  );
}

/** The recipe sidebar doubles as the drop zone that removes a recipe from the plan. */
function RecipeArea({ children }: { children: ReactNode }) {
  const { active } = useDndContext();
  const raw: unknown = active?.data.current;
  const removing = isDragSource(raw) && raw.kind === "slot";
  const { setNodeRef, isOver } = useDroppable({
    id: PANEL_DROP_ID,
    data: { kind: "panel" },
    disabled: !removing,
  });
  return (
    <aside
      ref={setNodeRef}
      className={`recipe-area${removing ? " is-drop-zone" : ""}${removing && isOver ? " is-over" : ""}`}
      aria-label="Recipe catalogue"
    >
      {removing && (
        <p className="drop-zone-hint" aria-hidden="true">
          Drop here to remove from the plan
        </p>
      )}
      {children}
    </aside>
  );
}

function DragChip({ recipe }: { recipe: Recipe }) {
  const meal = MEAL_TYPE_META[recipe.meal_type];
  return (
    <div className="drag-chip">
      <span aria-hidden="true">{meal.icon}</span> {recipe.name}
    </div>
  );
}
