"""``/api/weeks`` endpoints."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlmodel import Session

from cociboard import planner, repository
from cociboard.db import get_session
from cociboard.domain import MealSlot, week_start_for
from cociboard.schemas import (
    CandidateRead,
    NoteSet,
    RecipeArchivedDetail,
    SlotAssign,
    SlotMove,
    SuggestRequest,
    VarietyReport,
    WeekCopyRead,
    WeekCopyRequest,
    WeekPlanRead,
    WeekReplace,
)

router = APIRouter(prefix="/weeks", tags=["weeks"])

SessionDep = Annotated[Session, Depends(get_session)]
DayPath = Annotated[int, Path(ge=0, le=6, description="0 = Monday ... 6 = Sunday")]


def get_today() -> date:
    """Dependency returning today's date (overridable in tests)."""
    return date.today()


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _translate(exc: Exception) -> HTTPException:
    if isinstance(exc, repository.RecipeNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, f"Recipe {exc.args[0]} not found")
    if isinstance(exc, planner.EmptySlotError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "The slot is empty")
    if isinstance(exc, planner.InvalidWeekError):
        return _unprocessable("week_start must be a Monday")
    if isinstance(exc, planner.InvalidCopySourceError):
        return _unprocessable("from_week_start must be a Monday other than the target week")
    if isinstance(exc, planner.InvalidDayError):
        return _unprocessable("day must be between 0 and 6")
    if isinstance(exc, planner.RecipeArchivedError):
        detail = RecipeArchivedDetail(
            message="Archived recipes cannot be added to the plan; restore the recipe first",
            recipe_id=int(exc.args[0]),
        )
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail.model_dump(mode="json")
        )
    if isinstance(exc, planner.InvalidMealError):
        return _unprocessable("A slot holds exactly one of a recipe and a special meal")
    if isinstance(exc, planner.IncompatibleSlotError):
        return _unprocessable("The recipe's meal type does not fit that slot")
    if isinstance(exc, planner.PlanConflictError):
        return HTTPException(
            status.HTTP_409_CONFLICT, "The plan changed meanwhile; reload and try again"
        )
    raise exc


@router.get("/current", response_model=WeekPlanRead)
def get_current_week(
    session: SessionDep, today: Annotated[date, Depends(get_today)]
) -> WeekPlanRead:
    """Return the plan of the current week (Monday to Sunday)."""
    return planner.get_week_plan(session, week_start_for(today))


@router.get("/{week_start}", response_model=WeekPlanRead)
def get_week(week_start: date, session: SessionDep) -> WeekPlanRead:
    """Return the plan of the week starting on Monday ``week_start``."""
    try:
        return planner.get_week_plan(session, week_start)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.put("/{week_start}", response_model=WeekPlanRead)
def replace_week(week_start: date, body: WeekReplace, session: SessionDep) -> WeekPlanRead:
    """Replace the whole plan of a week atomically (used by undo)."""
    try:
        return planner.replace_week(session, week_start, body.slots)
    except (
        repository.RecipeNotFoundError,
        planner.InvalidWeekError,
        planner.InvalidMealError,
        planner.IncompatibleSlotError,
        planner.PlanConflictError,
    ) as exc:
        raise _translate(exc) from None


@router.delete("/{week_start}", response_model=WeekPlanRead)
def clear_week(week_start: date, session: SessionDep) -> WeekPlanRead:
    """Clear every slot of a week."""
    try:
        return planner.clear_week(session, week_start)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.get("/{week_start}/variety", response_model=VarietyReport)
def get_variety(week_start: date, session: SessionDep) -> VarietyReport:
    """Variety analysis of a week (also embedded in every week plan response)."""
    try:
        return planner.get_variety(session, week_start)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.post("/{week_start}/suggest", response_model=WeekPlanRead)
def suggest_week(
    week_start: date, session: SessionDep, body: SuggestRequest | None = None
) -> WeekPlanRead:
    """Fill the empty slots with varied recipes. Optional ``seed`` makes it repeatable."""
    try:
        return planner.suggest_week(session, week_start, body.seed if body else None)
    except (planner.InvalidWeekError, planner.PlanConflictError) as exc:
        raise _translate(exc) from None


@router.post("/{week_start}/copy", response_model=WeekCopyRead)
def copy_week(week_start: date, body: WeekCopyRequest, session: SessionDep) -> WeekCopyRead:
    """Copy another week's meals into the empty slots of this one (archived recipes skipped)."""
    try:
        return planner.copy_week(session, week_start, body.from_week_start)
    except (
        planner.InvalidWeekError,
        planner.InvalidCopySourceError,
        planner.PlanConflictError,
    ) as exc:
        raise _translate(exc) from None


@router.get("/{week_start}/days/{day}/{slot}/candidates", response_model=list[CandidateRead])
def get_candidates(
    week_start: date, day: DayPath, slot: MealSlot, session: SessionDep
) -> list[CandidateRead]:
    """Recipes that fit the slot, best for variety first."""
    try:
        return planner.slot_candidates(session, week_start, day, slot)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.put("/{week_start}/days/{day}/{slot}", response_model=WeekPlanRead)
def assign_slot(
    week_start: date, day: DayPath, slot: MealSlot, body: SlotAssign, session: SessionDep
) -> WeekPlanRead:
    """Assign a recipe or a special meal to a slot, replacing the current entry.

    Send exactly one of ``recipe_id`` and ``special``. The note sent is the note stored.
    """
    try:
        return planner.assign_slot(
            session, week_start, day, slot, body.recipe_id, body.special, body.note
        )
    except (
        repository.RecipeNotFoundError,
        planner.RecipeArchivedError,
        planner.InvalidWeekError,
        planner.IncompatibleSlotError,
        planner.PlanConflictError,
    ) as exc:
        raise _translate(exc) from None


@router.patch("/{week_start}/days/{day}/{slot}/note", response_model=WeekPlanRead)
def set_note(
    week_start: date, day: DayPath, slot: MealSlot, body: NoteSet, session: SessionDep
) -> WeekPlanRead:
    """Set or clear (``null``) the note of a filled slot; 404 when the slot is empty."""
    try:
        return planner.set_note(session, week_start, day, slot, body.note)
    except (planner.InvalidWeekError, planner.EmptySlotError) as exc:
        raise _translate(exc) from None


@router.delete("/{week_start}/days/{day}/{slot}", response_model=WeekPlanRead)
def clear_slot(week_start: date, day: DayPath, slot: MealSlot, session: SessionDep) -> WeekPlanRead:
    """Clear a slot."""
    try:
        return planner.clear_slot(session, week_start, day, slot)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.post("/{week_start}/move", response_model=WeekPlanRead)
def move_slot(week_start: date, body: SlotMove, session: SessionDep) -> WeekPlanRead:
    """Move a meal (recipe or special, with its note) to another slot, swapping if occupied."""
    try:
        return planner.move_slot(
            session, week_start, body.from_day, body.from_slot, body.to_day, body.to_slot
        )
    except (
        repository.RecipeNotFoundError,
        planner.InvalidWeekError,
        planner.EmptySlotError,
        planner.IncompatibleSlotError,
        planner.PlanConflictError,
    ) as exc:
        raise _translate(exc) from None
