"""Persistence for shopping lists: generated items, ticked keys and manual extras."""

from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, delete, select

from cociboard import pantry_repo, repository
from cociboard.domain import MealSlot, is_week_start
from cociboard.models import MealAssignment, ShoppingCheck, ShoppingExtra
from cociboard.planner import InvalidWeekError
from cociboard.schemas import (
    ShoppingExtraRead,
    ShoppingItemRead,
    ShoppingListRead,
    ShoppingMealRead,
)
from cociboard.shopping import PlannedMeal, aggregate
from cociboard.variety import slot_index


class ExtraNotFoundError(Exception):
    """No shopping extra with that id exists in that week."""


def _check_week(week_start: date) -> None:
    if not is_week_start(week_start):
        raise InvalidWeekError(week_start)


def _planned_meals(session: Session, week_start: date) -> list[PlannedMeal]:
    rows = session.exec(
        select(MealAssignment).where(col(MealAssignment.week_start) == week_start)
    ).all()
    meals = []
    for row in sorted(rows, key=lambda r: slot_index(r.day, MealSlot(r.slot))):
        if row.recipe_id is None:
            continue  # special meals have no ingredients
        recipe = repository.get_recipe(session, row.recipe_id)
        meals.append(
            PlannedMeal(
                day=row.day,
                slot=MealSlot(row.slot),
                recipe_id=row.recipe_id,
                recipe_name=recipe.name,
                ingredients=tuple(recipe.ingredients),
            )
        )
    return meals


def get_shopping_list(session: Session, week_start: date) -> ShoppingListRead:
    """Build the shopping list of a week from its planned meals, checks and extras."""
    _check_week(week_start)
    checked = set(
        session.exec(
            select(ShoppingCheck.item_key).where(col(ShoppingCheck.week_start) == week_start)
        ).all()
    )
    pantry = pantry_repo.pantry_keys(session)
    items = [
        ShoppingItemRead(
            key=item.key,
            name=item.name,
            checked=item.key in checked,
            in_pantry=item.key in pantry,
            meals=[
                ShoppingMealRead(
                    day=m.day, slot=m.slot, recipe_id=m.recipe_id, recipe_name=m.recipe_name
                )
                for m in item.meals
            ],
        )
        for item in aggregate(_planned_meals(session, week_start))
    ]
    extras = session.exec(
        select(ShoppingExtra)
        .where(col(ShoppingExtra.week_start) == week_start)
        .order_by(col(ShoppingExtra.created_at), col(ShoppingExtra.id))
    ).all()
    return ShoppingListRead(
        week_start=week_start,
        items=items,
        extras=[ShoppingExtraRead.model_validate(e) for e in extras],
    )


def set_check(session: Session, week_start: date, key: str, checked: bool) -> ShoppingListRead:
    """Tick or untick a generated item. Idempotent."""
    _check_week(week_start)
    existing = session.exec(
        select(ShoppingCheck).where(
            col(ShoppingCheck.week_start) == week_start, col(ShoppingCheck.item_key) == key
        )
    ).first()
    if checked and existing is None:
        session.add(ShoppingCheck(week_start=week_start, item_key=key))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()  # a concurrent request ticked it first: already checked
    elif not checked and existing is not None:
        session.delete(existing)
        session.commit()
    return get_shopping_list(session, week_start)


def uncheck_all(session: Session, week_start: date) -> ShoppingListRead:
    """Untick every generated item and extra of a week."""
    _check_week(week_start)
    session.exec(delete(ShoppingCheck).where(col(ShoppingCheck.week_start) == week_start))
    for extra in session.exec(
        select(ShoppingExtra).where(
            col(ShoppingExtra.week_start) == week_start, col(ShoppingExtra.checked)
        )
    ).all():
        extra.checked = False
        session.add(extra)
    session.commit()
    return get_shopping_list(session, week_start)


def _get_extra(session: Session, week_start: date, extra_id: int) -> ShoppingExtra:
    extra = session.get(ShoppingExtra, extra_id)
    if extra is None or extra.week_start != week_start:
        raise ExtraNotFoundError(extra_id)
    return extra


def add_extra(session: Session, week_start: date, name: str) -> ShoppingListRead:
    """Add a manual item."""
    _check_week(week_start)
    session.add(ShoppingExtra(week_start=week_start, name=name))
    session.commit()
    return get_shopping_list(session, week_start)


def update_extra(
    session: Session, week_start: date, extra_id: int, changes: dict[str, object]
) -> ShoppingListRead:
    """Rename and/or tick a manual item."""
    _check_week(week_start)
    extra = _get_extra(session, week_start, extra_id)
    if "name" in changes:
        extra.name = str(changes["name"])
    if "checked" in changes:
        extra.checked = bool(changes["checked"])
    session.add(extra)
    session.commit()
    return get_shopping_list(session, week_start)


def delete_extra(session: Session, week_start: date, extra_id: int) -> ShoppingListRead:
    """Remove a manual item."""
    _check_week(week_start)
    session.delete(_get_extra(session, week_start, extra_id))
    session.commit()
    return get_shopping_list(session, week_start)
