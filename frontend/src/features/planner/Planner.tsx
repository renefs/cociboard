import { ChevronLeft, ChevronRight, ShoppingCart, Sparkles } from "lucide-react";
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
import type { MealSlot, Recipe, SpecialMeal, WeekPlan } from "../../api/types";
import { RecipeDetailsModal } from "../recipes/RecipeDetailsModal";
import { RecipePanel } from "../recipes/RecipePanel";
import { useHouseholdSettings } from "../settings/useHouseholdSettings";
import { ShareMenu } from "../share/ShareMenu";
import { ShoppingListDialog, ShoppingListView } from "../shopping/ShoppingListDialog";
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
import { leftoversTarget } from "./leftovers";
import { NARROW_QUERY } from "./mobileView";
import { MobileTabBar } from "./MobileTabBar";
import { RecipePicker } from "./RecipePicker";
import { MouseAndPenSensor, POINTER_ACTIVATION, TOUCH_ACTIVATION, collisionDetection } from "./sensors";
import { SlotActions } from "./SlotActions";
import { dayParams, fitsSlot, mealAt, mealName, recipeOf, type SlotMeal } from "./slots";
import { SPECIAL_META } from "./specialMeta";
import { TodayView } from "./TodayView";
import { WeekActionsMenu } from "./WeekActionsMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast, type ToastAction, type ToastMessage } from "./Toast";
import { useMediaQuery, prefersReducedMotion } from "./useMediaQuery";
import { useMobileView } from "./useMobileView";
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
  const household = useHouseholdSettings().data;
  const mealTimes = useMemo(
    () => (household ? { lunch: household.lunch_time, dinner: household.dinner_time } : undefined),
    [household],
  );

  // Below 900px one view is shown at a time (ADR-0017); on desktop everything is visible.
  const narrow = useMediaQuery(NARROW_QUERY);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { view, setView, go } = useMobileView(narrow);
  const shows = (target: typeof view) => !narrow || view === target;

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

  // Moving to another view moves focus to its heading (screen reader and keyboard users
  // land at the top of the new view).
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    if (!narrow) return;
    const heading = document.querySelector<HTMLElement>(`[data-view="${view}"] h2`);
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [view, narrow]);

  // Opening the Week tab on the current week shows today's card (select mode has its own scroll).
  const selectingRef = useRef(selecting);
  useEffect(() => {
    selectingRef.current = selecting;
  }, [selecting]);
  const hasPlan = plan !== undefined;
  useEffect(() => {
    if (!narrow || view !== "week" || !isCurrentWeek || !hasPlan || selectingRef.current) return;
    const card = document.querySelector<HTMLElement>(".day--today");
    if (typeof card?.scrollIntoView === "function") {
      card.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [narrow, view, isCurrentWeek, hasPlan]);

  // Bring the first valid target into view when select mode starts (on phones the Add button
  // has just switched to the Week tab). An empty slot is the likelier destination than one
  // that would be replaced, so it goes first.
  useEffect(() => {
    if (!selecting) return;
    const target =
      document.querySelector<HTMLElement>('[data-select-target="empty"]') ??
      document.querySelector<HTMLElement>('[data-select-target="true"]');
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
    const filled = plan ? mealAt(plan, { day, slot }) : null;
    setUi(filled ? { kind: "actions", day, slot } : { kind: "picker", day, slot });
  };

  const placeSpecial = (special: SpecialMeal, day: number, slot: MealSlot) => {
    actions.assignSpecial({ day, slot }, special);
    notify(
      "info",
      t(`planner.specialSet.${slot}`, {
        name: t(SPECIAL_META[special].labelKey),
        ...dayParams(day, locale),
      }),
    );
  };

  const toggleSelect = (recipe: Recipe) => {
    const starting = selecting?.id !== recipe.id;
    setSelecting(starting ? recipe : null);
    // The slots are on the Week tab; cancelling stays wherever the user is.
    if (starting && narrow) go("start-select");
  };

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
        {narrow && view === "today" && (
          <TodayView now={now} onPlanWeek={() => go("plan-week")} onNotify={(kind, text) => notify(kind, text)} />
        )}

        <section className="planner" data-view="week" hidden={!shows("week")} aria-labelledby="planner-heading">
          <header className="planner-head">
            <h2 id="planner-heading" className="visually-hidden">
              {t("planner.heading")}
            </h2>
            <nav className="week-nav" aria-label={t("planner.weekNav")}>
              <button type="button" className="icon-button week-step" aria-label={t("planner.previousWeek")} onClick={previous}>
                <ChevronLeft aria-hidden="true" size={20} />
              </button>
              <p className="week-range" aria-live="polite">
                <span className="visually-hidden">{t("planner.weekOf")}</span>
                {formatWeekRangeShort(weekStart, locale)}
              </p>
              <button type="button" className="icon-button week-step" aria-label={t("planner.nextWeek")} onClick={next}>
                <ChevronRight aria-hidden="true" size={20} />
              </button>
              <button type="button" className="btn week-today" disabled={isCurrentWeek} onClick={today}>
                {t("planner.thisWeek")}
              </button>
            </nav>
            <div className="week-actions" role="group" aria-label={t("planner.weekActions")}>
              <button
                type="button"
                className="btn btn-primary week-fill"
                disabled={!plan || tools.busy || countFilled(plan) === 14}
                title={t("planner.suggestTitle")}
                onClick={() => void tools.suggest()}
              >
                <Sparkles aria-hidden="true" size={18} className="icon" />
                {t("planner.suggest")}
              </button>
              <button
                type="button"
                className="btn week-shopping"
                disabled={!plan}
                title={t("shopping.openTitle")}
                onClick={() => (narrow ? go("open-shopping") : setUi({ kind: "shopping" }))}
              >
                <ShoppingCart aria-hidden="true" size={18} className="icon" />
                <span className="btn-label">{t("shopping.open")}</span>
              </button>
              <ShareMenu plan={plan} onNotify={notify} mealTimes={mealTimes} />
              <WeekActionsMenu
                disabled={!plan}
                copyDisabled={!plan || tools.busy || countFilled(plan) === 14}
                clearDisabled={!plan || tools.busy || countFilled(plan) === 0}
                onCopyPrevious={() => void tools.copyPrevious()}
                onClear={() => setUi({ kind: "confirm-clear" })}
              />
            </div>
          </header>

          {plan && (
            <VarietySummary
              variety={plan.variety}
              highlightedId={highlightedIssue ? highlightedId : null}
              onHighlight={setHighlightedId}
            />
          )}

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

        <RecipeArea hidden={!shows("recipes")}>
          <RecipePanel
            density="compact"
            {...(usage ? { usage } : {})}
            proteinCounts={plan?.variety.protein_counts ?? {}}
            onNotify={(kind, text) => notify(kind, text)}
            renderCard={(recipe, open, toggleFavourite) => (
              <DraggableRecipeCard
                recipe={recipe}
                selected={selecting?.id === recipe.id}
                onAdd={toggleSelect}
                onOpen={open}
                onToggleFavourite={toggleFavourite}
                usageCount={usage?.get(recipe.id) ?? 0}
              />
            )}
          />
        </RecipeArea>

        {narrow && view === "shopping" && (
          <section className="shopping-view" data-view="shopping" aria-labelledby="shopping-view-heading">
            <h2 id="shopping-view-heading">{t("shopping.title", { range: formatWeekRange(weekStart, locale) })}</h2>
            <ShoppingListView weekStart={weekStart} inline onNotify={(kind, text) => notify(kind, text)} />
          </section>
        )}
      </div>

      {narrow && <MobileTabBar view={view} onChange={setView} />}

      {/* The drop animation is skipped when the user asked for less motion. */}
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>{dragging ? <DragChip source={dragging} /> : null}</DragOverlay>

      {ui.kind === "picker" && (
        <RecipePicker
          title={t(plan && mealAt(plan, ui) ? `planner.pickerReplace.${ui.slot}` : `planner.pickerAdd.${ui.slot}`, dayParams(ui.day, locale))}
          weekStart={weekStart}
          day={ui.day}
          slot={ui.slot}
          onClose={closeUi}
          onPick={(recipe) => {
            place(recipe, ui.day, ui.slot);
            closeUi();
          }}
          onPickSpecial={(special) => {
            placeSpecial(special, ui.day, ui.slot);
            closeUi();
          }}
        />
      )}
      {ui.kind === "actions" && plan && <ActionsFor plan={plan} ui={ui} actions={actions} setUi={setUi} notify={(kind, text) => notify(kind, text)} />}
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
  notify: (kind: "info", text: string) => void;
}

function ActionsFor({ plan, ui, actions, setUi, notify }: ActionsForProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const meal: SlotMeal | null = mealAt(plan, ui);
  if (!meal) return null;
  const leftovers = leftoversTarget(plan, ui);
  return (
    <SlotActions
      meal={meal}
      slot={ui}
      onClose={() => setUi({ kind: "none" })}
      onReplace={() => setUi({ kind: "picker", day: ui.day, slot: ui.slot })}
      onDetails={() => setUi({ kind: "details", day: ui.day, slot: ui.slot })}
      onLeftovers={
        leftovers
          ? () => {
              // One request: the leftovers special with the recipe name as its note.
              actions.assignSpecial(leftovers, "leftovers", recipeOf(meal)?.name ?? null);
              notify("info", t(`planner.leftoversPlanned.${leftovers.slot}`, dayParams(leftovers.day, locale)));
              setUi({ kind: "none" });
            }
          : undefined
      }
      onSaveNote={(note) => {
        actions.setNote(ui, note);
        notify("info", t(note ? "planner.noteSaved" : "planner.noteRemoved"));
        setUi({ kind: "none" });
      }}
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
  const recipe = recipeOf(mealAt(plan, ui));
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
function RecipeArea({ children, hidden }: { children: ReactNode; hidden: boolean }) {
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
      data-view="recipes"
      hidden={hidden}
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

function DragChip({ source }: { source: DragSource }) {
  const { t } = useTranslation();
  const recipe = source.kind === "recipe" ? source.recipe : recipeOf(source.meal);
  const icon = recipe
    ? MEAL_TYPE_META[recipe.meal_type].icon
    : source.kind === "slot" && source.meal.kind === "special"
      ? SPECIAL_META[source.meal.special].icon
      : "";
  const name = source.kind === "recipe" ? source.recipe.name : mealName(source.meal, t);
  return (
    <div className="drag-chip">
      <span aria-hidden="true">{icon}</span> {name}
    </div>
  );
}
