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
import { Trans, useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import type { MealSlot, Recipe, WeekPlan } from "../../api/types";
import { RecipeDetailsModal } from "../recipes/RecipeDetailsModal";
import { RecipePanel } from "../recipes/RecipePanel";
import { ShoppingListDialog } from "../shopping/ShoppingListDialog";
import { VarietySummary } from "../variety/VarietySummary";
import {
  findIssue,
  issueSlotKeys,
  usageCounts,
  warningsBySlot,
} from "../variety/varietyLogic";
import { MEAL_TYPE_META } from "../recipes/recipeMeta";
import { DraggableRecipeCard } from "./DraggableRecipeCard";
import {
  PANEL_DROP_ID,
  announceCancel,
  type AnnounceContext,
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
import { dayParams, fitsSlot, recipeAt } from "./slots";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast, type ToastAction, type ToastMessage } from "./Toast";
import { useWeekNavigation } from "./useWeekNavigation";
import { usePlanActions, usePrefetchNeighbours, useWeekPlan } from "./useWeekPlan";
import { useWeekTools } from "./useWeekTools";
import { countFilled } from "./planTransforms";
import { formatWeekRange, formatWeekRangeShort } from "./weekMath";
import { WeekGrid } from "./WeekGrid";
import { WeekGridSkeleton } from "./WeekGridSkeleton";

type Ui =
  | { kind: "none" }
  | { kind: "picker"; day: number; slot: MealSlot }
  | { kind: "actions"; day: number; slot: MealSlot }
  | { kind: "details"; day: number; slot: MealSlot }
  | { kind: "confirm-clear" }
  | { kind: "shopping" };

interface PlannerProps {
  /** Current time; injectable for tests. */
  now?: Date;
}

export function Planner({ now: nowProp }: PlannerProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const screenReader: ScreenReaderInstructions = { draggable: t("planner.keyboardInstructions") };
  const announce: AnnounceContext = { t, locale };
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const { weekStart, isCurrentWeek, previous, next, today } = useWeekNavigation(now);
  usePrefetchNeighbours(weekStart);
  const { data: plan, isPending, isError, refetch } = useWeekPlan(weekStart);

  const [ui, setUi] = useState<Ui>({ kind: "none" });
  const [selecting, setSelecting] = useState<Recipe | null>(null);
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);

  // A highlight belongs to the issues of one week.
  const [highlight, setHighlight] = useState<{ week: string; id: string } | null>(null);
  const highlightedId = highlight?.week === weekStart ? highlight.id : null;
  const setHighlightedId = useCallback(
    (id: string | null) => setHighlight(id === null ? null : { week: weekStart, id }),
    [weekStart],
  );

  const notify = useCallback((kind: ToastMessage["kind"], text: string, action?: ToastAction) => {
    toastId.current += 1;
    setToast({ id: toastId.current, kind, text, ...(action ? { action } : {}) });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const actions = usePlanActions(weekStart, (message) => notify("error", message));
  const tools = useWeekTools(weekStart, notify);

  const warnings = useMemo(() => (plan ? warningsBySlot(plan.variety, t, locale) : undefined), [plan, t, locale]);
  const highlightedIssue = plan ? findIssue(plan.variety, highlightedId) : null;
  const highlighted = useMemo(() => issueSlotKeys(highlightedIssue), [highlightedIssue]);
  const usage = useMemo(() => (plan ? usageCounts(plan) : undefined), [plan]);

  // Bring the highlighted slots into view (the grid can be long on mobile).
  useEffect(() => {
    if (!highlightedId) return;
    const first = document.querySelector<HTMLElement>(".slot--highlight");
    if (typeof first?.scrollIntoView === "function") {
      first.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlightedId]);

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
    notify("info", t(`planner.added.${slot}`, { name: recipe.name, ...dayParams(day, locale) }));
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
      return source ? announceStart(announce, source) : undefined;
    },
    onDragOver: ({ active, over }: DragOverEvent) => {
      const source = sourceOf(active.data.current);
      const data: unknown = over?.data.current;
      if (!source || !plan) return undefined;
      return announceOver(announce, plan, source, isDropTarget(data) ? data : null);
    },
    onDragEnd: ({ active, over }) => {
      const source = sourceOf(active.data.current);
      const data: unknown = over?.data.current;
      if (!source || !plan) return undefined;
      return announceEnd(announce, plan, source, isDropTarget(data) ? data : null);
    },
    onDragCancel: ({ active }) => {
      const source = sourceOf(active.data.current);
      return source ? announceCancel(announce, source) : undefined;
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
      accessibility={{ announcements, screenReaderInstructions: screenReader }}
    >
      <div className="planner-layout">
        <section className="planner" aria-labelledby="planner-heading">
          <header className="planner-head">
            <h2 id="planner-heading">{t("planner.heading")}</h2>
            <nav className="week-nav" aria-label={t("planner.weekNav")}>
              <button type="button" className="icon-button week-step" aria-label={t("planner.previousWeek")} onClick={previous}>
                <span aria-hidden="true">‹</span>
              </button>
              <button type="button" className="btn week-today" disabled={isCurrentWeek} onClick={today}>
                {t("planner.thisWeek")}
              </button>
              <button type="button" className="icon-button week-step" aria-label={t("planner.nextWeek")} onClick={next}>
                <span aria-hidden="true">›</span>
              </button>
              <p className="week-range" aria-live="polite">
                <span className="visually-hidden">{t("planner.weekOf")}</span>
                {formatWeekRangeShort(weekStart, locale)}
              </p>
            </nav>
          </header>

          <div className="planner-toolbar">
            <div className="toolbar-buttons" role="group" aria-label={t("planner.weekActions")}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!plan || tools.busy || countFilled(plan) === 14}
                title={t("planner.suggestTitle")}
                onClick={() => void tools.suggest()}
              >
                <span aria-hidden="true">✨ </span>{t("planner.suggest")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!plan || tools.busy || countFilled(plan) === 14}
                title={t("planner.copyLastWeekTitle")}
                onClick={() => void tools.copyPrevious()}
              >
                <span aria-hidden="true">📋 </span>
                <span className="label-long">{t("planner.copyLastWeek")}</span>
                <span className="label-short" aria-hidden="true">
                  {t("planner.copyLastWeekShort")}
                </span>
              </button>
              <button
                type="button"
                className="btn"
                disabled={!plan || tools.busy || countFilled(plan) === 0}
                onClick={() => setUi({ kind: "confirm-clear" })}
              >
                {t("planner.clearWeek")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!plan}
                title={t("shopping.openTitle")}
                onClick={() => setUi({ kind: "shopping" })}
              >
                <span aria-hidden="true">🛒 </span>{t("shopping.open")}
              </button>
            </div>
            {plan && (
              <VarietySummary
                variety={plan.variety}
                highlightedId={highlightedIssue ? highlightedId : null}
                onHighlight={setHighlightedId}
              />
            )}
          </div>

          {selecting && (
            <div className="select-banner" role="status">
              <span>
                <Trans
                  i18nKey="planner.chooseSlot"
                  values={{ name: selecting.name }}
                  components={{ strong: <strong /> }}
                />
              </span>
              <button type="button" className="btn" onClick={() => setSelecting(null)}>
                {t("common.cancel")}
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
              warnings={warnings}
              highlighted={highlighted}
            />
          ) : isError ? (
            <div className="state-box" role="alert">
              <p>{t("planner.loadError")}</p>
              <button type="button" className="btn" onClick={() => void refetch()}>
                {t("common.retry")}
              </button>
            </div>
          ) : (
            isPending && <WeekGridSkeleton />
          )}
        </section>

        <RecipeArea>
          <RecipePanel
            density="compact"
            {...(usage ? { usage } : {})}
            proteinCounts={plan?.variety.protein_counts ?? {}}
            onNotify={(kind, text) => notify(kind, text)}
            renderCard={(recipe, open) => (
              <DraggableRecipeCard
                recipe={recipe}
                selected={selecting?.id === recipe.id}
                onAdd={toggleSelect}
                onOpen={open}
                usageCount={usage?.get(recipe.id) ?? 0}
              />
            )}
          />
        </RecipeArea>
      </div>

      <DragOverlay>{dragging ? <DragChip recipe={dragging.recipe} /> : null}</DragOverlay>

      {ui.kind === "picker" && (
        <RecipePicker
          title={t(plan && recipeAt(plan, ui) ? `planner.pickerReplace.${ui.slot}` : `planner.pickerAdd.${ui.slot}`, dayParams(ui.day, locale))}
          weekStart={weekStart}
          day={ui.day}
          slot={ui.slot}
          onClose={closeUi}
          onPick={(recipe) => {
            place(recipe, ui.day, ui.slot);
            closeUi();
          }}
        />
      )}
      {ui.kind === "actions" && plan && <ActionsFor plan={plan} ui={ui} actions={actions} setUi={setUi} />}
      {ui.kind === "details" && plan && (
        <SlotDetails plan={plan} ui={ui} setUi={setUi} onNotify={(kind, text) => notify(kind, text)} />
      )}

      {ui.kind === "confirm-clear" && plan && (
        <ConfirmDialog
          title={t("planner.clearTitle")}
          confirmLabel={t("planner.clearWeek")}
          onCancel={closeUi}
          onConfirm={() => {
            closeUi();
            void tools.clear();
          }}
        >
          <p>
            {t("planner.clearBody", {
              count: countFilled(plan),
              range: formatWeekRange(weekStart, locale),
            })}
          </p>
        </ConfirmDialog>
      )}

      {ui.kind === "shopping" && (
        <ShoppingListDialog weekStart={weekStart} onClose={closeUi} onNotify={(kind, text) => notify(kind, text)} />
      )}

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
      onDetails={() => setUi({ kind: "details", day: ui.day, slot: ui.slot })}
      onRemove={() => {
        actions.clear(ui);
        setUi({ kind: "none" });
      }}
    />
  );
}

/** "View details" of a planned recipe; Back returns to the slot's actions. */
function SlotDetails({
  plan,
  ui,
  setUi,
  onNotify,
}: {
  plan: WeekPlan;
  ui: { day: number; slot: MealSlot };
  setUi: (ui: Ui) => void;
  onNotify: (kind: "error" | "info", text: string) => void;
}) {
  const { t } = useTranslation();
  const recipe = recipeAt(plan, ui);
  if (!recipe) return null;
  return (
    <RecipeDetailsModal
      recipe={recipe}
      onClose={() => setUi({ kind: "none" })}
      onNotify={onNotify}
      footerStart={
        <button
          type="button"
          className="btn btn-large"
          onClick={() => setUi({ kind: "actions", day: ui.day, slot: ui.slot })}
        >
          {t("common.back")}
        </button>
      }
    />
  );
}

/** The recipe sidebar doubles as the drop zone that removes a recipe from the plan. */
function RecipeArea({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
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
      aria-label={t("planner.recipeCatalogue")}
    >
      {removing && (
        <p className="drop-zone-hint" aria-hidden="true">
          {t("planner.dropToRemove")}
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
