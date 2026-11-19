"""``/api/weeks/{week_start}/shopping-list`` endpoints."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from cociboard import planner, shopping_repo
from cociboard.db import get_session
from cociboard.schemas import (
    ShoppingCheckSet,
    ShoppingExtraCreate,
    ShoppingExtraUpdate,
    ShoppingListRead,
)

router = APIRouter(prefix="/weeks/{week_start}/shopping-list", tags=["shopping"])

SessionDep = Annotated[Session, Depends(get_session)]


def _translate(exc: Exception) -> HTTPException:
    if isinstance(exc, planner.InvalidWeekError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "week_start must be a Monday")
    if isinstance(exc, shopping_repo.ExtraNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, f"Extra item {exc.args[0]} not found")
    raise exc


@router.get("", response_model=ShoppingListRead)
def get_shopping_list(week_start: date, session: SessionDep) -> ShoppingListRead:
    """The ingredients of the week's planned meals plus manual extras."""
    try:
        return shopping_repo.get_shopping_list(session, week_start)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.put("/checks", response_model=ShoppingListRead)
def set_check(week_start: date, body: ShoppingCheckSet, session: SessionDep) -> ShoppingListRead:
    """Tick or untick a generated item (idempotent)."""
    try:
        return shopping_repo.set_check(session, week_start, body.key, body.checked)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.delete("/checks", response_model=ShoppingListRead)
def uncheck_all(week_start: date, session: SessionDep) -> ShoppingListRead:
    """Untick every item and extra."""
    try:
        return shopping_repo.uncheck_all(session, week_start)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.post("/extras", response_model=ShoppingListRead, status_code=status.HTTP_201_CREATED)
def add_extra(week_start: date, body: ShoppingExtraCreate, session: SessionDep) -> ShoppingListRead:
    """Add a manual item."""
    try:
        return shopping_repo.add_extra(session, week_start, body.name)
    except planner.InvalidWeekError as exc:
        raise _translate(exc) from None


@router.patch("/extras/{extra_id}", response_model=ShoppingListRead)
def update_extra(
    week_start: date, extra_id: int, body: ShoppingExtraUpdate, session: SessionDep
) -> ShoppingListRead:
    """Rename and/or tick a manual item."""
    try:
        return shopping_repo.update_extra(
            session, week_start, extra_id, body.model_dump(exclude_unset=True)
        )
    except (planner.InvalidWeekError, shopping_repo.ExtraNotFoundError) as exc:
        raise _translate(exc) from None


@router.delete("/extras/{extra_id}", response_model=ShoppingListRead)
def delete_extra(week_start: date, extra_id: int, session: SessionDep) -> ShoppingListRead:
    """Remove a manual item."""
    try:
        return shopping_repo.delete_extra(session, week_start, extra_id)
    except (planner.InvalidWeekError, shopping_repo.ExtraNotFoundError) as exc:
        raise _translate(exc) from None
