"""Persistence for the pantry (ADR-0023)."""

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from cociboard import repository
from cociboard.models import PantryItem
from cociboard.pantry import suggest_staples
from cociboard.schemas import PantryItemRead, PantryRead, PantrySuggestionRead
from cociboard.shopping import ingredient_key


class PantryItemNotFoundError(Exception):
    """No pantry item with that id exists."""


class EmptyKeyError(ValueError):
    """The name has no letters or digits to match on."""


def pantry_keys(session: Session) -> set[str]:
    """The keys of every pantry item."""
    return set(session.exec(select(PantryItem.key)).all())


def get_pantry(session: Session) -> PantryRead:
    """Items (sorted by key) and the suggestions drawn from the active recipes."""
    items = session.exec(select(PantryItem).order_by(col(PantryItem.key))).all()
    recipes = repository.list_recipes(session)  # active (non-archived) only
    suggestions = suggest_staples((r.ingredients for r in recipes), {i.key for i in items})
    return PantryRead(
        items=[PantryItemRead.model_validate(i) for i in items],
        suggestions=[
            PantrySuggestionRead(key=s.key, name=s.name, recipe_count=s.recipe_count)
            for s in suggestions
        ],
    )


def add_item(session: Session, name: str) -> tuple[PantryItem, bool]:
    """Add a staple. Returns ``(item, created)``; an existing key returns that item."""
    key = ingredient_key(name)
    if not key:
        raise EmptyKeyError(name)
    existing = session.exec(select(PantryItem).where(col(PantryItem.key) == key)).first()
    if existing is not None:
        return existing, False
    item = PantryItem(key=key, name=" ".join(name.split()))
    session.add(item)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()  # a concurrent request added it first
        existing = session.exec(select(PantryItem).where(col(PantryItem.key) == key)).one()
        return existing, False
    session.refresh(item)
    return item, True


def delete_item(session: Session, item_id: int) -> None:
    """Remove a staple."""
    item = session.get(PantryItem, item_id)
    if item is None:
        raise PantryItemNotFoundError(item_id)
    session.delete(item)
    session.commit()
