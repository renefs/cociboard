"""Persistence operations for recipes."""

from collections.abc import Sequence

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from cociboard.domain import MealSlot, RecipeProperty, fits_slot
from cociboard.models import Recipe
from cociboard.schemas import RecipeCreate, RecipeUpdate


class RecipeNotFoundError(Exception):
    """Raised when a recipe id does not exist."""


class DuplicateRecipeNameError(Exception):
    """Raised when a recipe name is already taken."""


def _name_taken(session: Session, name: str, exclude_id: int | None = None) -> bool:
    statement = select(Recipe.id).where(func.lower(col(Recipe.name)) == name.lower())
    return any(found != exclude_id for found in session.exec(statement))


def matches(
    recipe: Recipe,
    slot: MealSlot | None,
    query: str | None,
    properties: Sequence[RecipeProperty],
) -> bool:
    """Whether ``recipe`` satisfies all given filters (properties are AND-ed)."""
    if slot is not None and not fits_slot(recipe.meal_type, slot):
        return False
    if properties and not {p.value for p in properties} <= set(recipe.properties):
        return False
    if query:
        needle = query.strip().lower()
        haystack = [recipe.name, *recipe.ingredients]
        if needle and not any(needle in text.lower() for text in haystack):
            return False
    return True


def list_recipes(
    session: Session,
    slot: MealSlot | None = None,
    query: str | None = None,
    properties: Sequence[RecipeProperty] = (),
) -> list[Recipe]:
    """Return recipes ordered by name, filtered by slot, text and properties."""
    recipes = session.exec(select(Recipe).order_by(func.lower(col(Recipe.name)))).all()
    return [r for r in recipes if matches(r, slot, query, properties)]


def get_recipe(session: Session, recipe_id: int) -> Recipe:
    """Return one recipe or raise :class:`RecipeNotFoundError`."""
    recipe = session.get(Recipe, recipe_id)
    if recipe is None:
        raise RecipeNotFoundError(recipe_id)
    return recipe


def _commit(session: Session, recipe: Recipe) -> Recipe:
    try:
        session.add(recipe)
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise DuplicateRecipeNameError(recipe.name) from exc
    session.refresh(recipe)
    return recipe


def create_recipe(session: Session, data: RecipeCreate) -> Recipe:
    """Insert a recipe; raise :class:`DuplicateRecipeNameError` on a name clash."""
    if _name_taken(session, data.name):
        raise DuplicateRecipeNameError(data.name)
    recipe = Recipe(
        name=data.name,
        description=data.description,
        meal_type=data.meal_type,
        protein=data.protein,
        prep_minutes=data.prep_minutes,
        ingredients=list(data.ingredients),
        properties=[p.value for p in data.properties],
    )
    return _commit(session, recipe)


def update_recipe(session: Session, recipe_id: int, data: RecipeUpdate) -> Recipe:
    """Apply a partial update to a recipe."""
    recipe = get_recipe(session, recipe_id)
    changes = data.changes()
    new_name = changes.get("name")
    if isinstance(new_name, str) and _name_taken(session, new_name, exclude_id=recipe_id):
        raise DuplicateRecipeNameError(new_name)
    if "properties" in changes:
        changes["properties"] = [p.value for p in data.properties or []]
    for key, value in changes.items():
        setattr(recipe, key, value)
    return _commit(session, recipe)


def delete_recipe(session: Session, recipe_id: int) -> None:
    """Delete a recipe or raise :class:`RecipeNotFoundError`."""
    recipe = get_recipe(session, recipe_id)
    session.delete(recipe)
    session.commit()


def count_recipes(session: Session) -> int:
    """Return the number of stored recipes."""
    return session.exec(select(func.count()).select_from(Recipe)).one()
