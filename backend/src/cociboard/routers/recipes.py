"""``/api/recipes`` endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from cociboard import repository
from cociboard.db import get_session
from cociboard.domain import MealSlot, RecipeProperty
from cociboard.schemas import (
    ConflictSlot,
    DuplicateNameDetail,
    MealTypeConflictDetail,
    RecipeCreate,
    RecipeRead,
    RecipeUpdate,
    RecipeUsage,
)

router = APIRouter(prefix="/recipes", tags=["recipes"])

SessionDep = Annotated[Session, Depends(get_session)]


def _not_found(recipe_id: int) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"Recipe {recipe_id} not found")


def _duplicate(exc: repository.DuplicateRecipeNameError) -> HTTPException:
    detail = DuplicateNameDetail(
        message=f"A recipe named '{exc.args[0]}' already exists", archived=exc.archived
    )
    return HTTPException(status.HTTP_409_CONFLICT, detail=detail.model_dump(mode="json"))


@router.get("", response_model=list[RecipeRead])
def list_recipes(
    session: SessionDep,
    slot: Annotated[MealSlot | None, Query(description="Only recipes that fit this slot")] = None,
    q: Annotated[str | None, Query(description="Search in name and ingredients")] = None,
    properties: Annotated[
        list[RecipeProperty] | None,
        Query(alias="property", description="Required property; repeat to require several"),
    ] = None,
    archived: Annotated[
        bool, Query(description="true returns only archived recipes; default hides them")
    ] = False,
) -> list[RecipeRead]:
    """List recipes, optionally filtered. Archived recipes are hidden unless asked for."""
    recipes = repository.list_recipes(session, slot, q, properties or [], archived)
    return [RecipeRead.model_validate(r) for r in recipes]


@router.get("/{recipe_id}/usage", response_model=RecipeUsage)
def recipe_usage(recipe_id: int, session: SessionDep) -> RecipeUsage:
    """Return how many planned slots (across all weeks) use the recipe."""
    try:
        return RecipeUsage(count=repository.count_usage(session, recipe_id))
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None


@router.get("/{recipe_id}", response_model=RecipeRead)
def get_recipe(recipe_id: int, session: SessionDep) -> RecipeRead:
    """Return one recipe."""
    try:
        return RecipeRead.model_validate(repository.get_recipe(session, recipe_id))
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None


@router.post("", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
def create_recipe(data: RecipeCreate, session: SessionDep) -> RecipeRead:
    """Create a recipe."""
    try:
        return RecipeRead.model_validate(repository.create_recipe(session, data))
    except repository.DuplicateRecipeNameError as exc:
        raise _duplicate(exc) from None


@router.patch("/{recipe_id}", response_model=RecipeRead)
def update_recipe(
    recipe_id: int,
    data: RecipeUpdate,
    session: SessionDep,
    force: Annotated[
        bool, Query(description="Remove planned meals that no longer fit a new meal type")
    ] = False,
) -> RecipeRead:
    """Partially update a recipe.

    ``archived`` archives or restores the recipe without touching planned meals.
    Answers 409 with a structured ``detail`` (``code: meal_type_conflict``) when a meal-type
    change would leave the recipe in slots it no longer fits, unless ``force=true``.
    """
    try:
        return RecipeRead.model_validate(
            repository.update_recipe(session, recipe_id, data, force=force)
        )
    except repository.MealTypeConflictError as exc:
        detail = MealTypeConflictDetail(
            message=f"{len(exc.conflicts)} planned meals no longer fit the new meal type",
            conflicts=[
                ConflictSlot(week_start=a.week_start, day=a.day, slot=a.slot) for a in exc.conflicts
            ],
        )
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail=detail.model_dump(mode="json")
        ) from None
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None
    except repository.DuplicateRecipeNameError as exc:
        raise _duplicate(exc) from None


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, session: SessionDep) -> Response:
    """Delete a recipe permanently, including its planned meals in every week."""
    try:
        repository.delete_recipe(session, recipe_id)
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
