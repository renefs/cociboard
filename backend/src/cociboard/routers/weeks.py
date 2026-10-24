"""``/api/weeks`` endpoints."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlmodel import Session

from cociboard import planner, repository
from cociboard.db import get_session
from cociboard.domain import MealSlot, week_start_for
from cociboard.schemas import SlotAssign, SlotMove, WeekPlanRead

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
        return HTTPException(status.HTTP_404_NOT_FOUND, "The source slot is empty")
    if isinstance(exc, planner.InvalidWeekError):
        return _unprocessable("week_start must be a Monday")
    if isinstance(exc, planner.InvalidDayError):
        return _unprocessable("day must be between 0 and 6")
    if isinstance(exc, planner.IncompatibleSlotError):
        return _unprocessable("The recipe's meal type does not fit that slot")
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


@router.put("/{week_start}/days/{day}/{slot}", response_model=WeekPlanRead)
def assign_slot(
    week_start: date, day: DayPath, slot: MealSlot, body: SlotAssign, session: SessionDep
) -> WeekPlanRead:
    """Assign a recipe to a slot, replacing the current one."""
    try:
        return planner.assign_slot(session, week_start, day, slot, body.recipe_id)
    except (
        repository.RecipeNotFoundError,
        planner.InvalidWeekError,
        planner.IncompatibleSlotError,
    ) as exc:
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
    """Move a recipe to another slot, swapping when the target is occupied."""
    try:
        return planner.move_slot(
            session, week_start, body.from_day, body.from_slot, body.to_day, body.to_slot
        )
    except (
        repository.RecipeNotFoundError,
        planner.InvalidWeekError,
        planner.EmptySlotError,
        planner.IncompatibleSlotError,
    ) as exc:
        raise _translate(exc) from None
