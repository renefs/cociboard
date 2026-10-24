"""``/api/recipes`` endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from cociboard import repository
from cociboard.db import get_session
from cociboard.domain import MealSlot, RecipeProperty
from cociboard.schemas import RecipeCreate, RecipeRead, RecipeUpdate

router = APIRouter(prefix="/recipes", tags=["recipes"])

SessionDep = Annotated[Session, Depends(get_session)]


def _not_found(recipe_id: int) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"Recipe {recipe_id} not found")


def _duplicate(name: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, f"A recipe named '{name}' already exists")


@router.get("", response_model=list[RecipeRead])
def list_recipes(
    session: SessionDep,
    slot: Annotated[MealSlot | None, Query(description="Only recipes that fit this slot")] = None,
    q: Annotated[str | None, Query(description="Search in name and ingredients")] = None,
    properties: Annotated[
        list[RecipeProperty] | None,
        Query(alias="property", description="Required property; repeat to require several"),
    ] = None,
) -> list[RecipeRead]:
    """List recipes, optionally filtered."""
    recipes = repository.list_recipes(session, slot, q, properties or [])
    return [RecipeRead.model_validate(r) for r in recipes]


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
    except repository.DuplicateRecipeNameError:
        raise _duplicate(data.name) from None


@router.patch("/{recipe_id}", response_model=RecipeRead)
def update_recipe(recipe_id: int, data: RecipeUpdate, session: SessionDep) -> RecipeRead:
    """Partially update a recipe."""
    try:
        return RecipeRead.model_validate(repository.update_recipe(session, recipe_id, data))
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None
    except repository.DuplicateRecipeNameError:
        raise _duplicate(data.name or "") from None


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, session: SessionDep) -> Response:
    """Delete a recipe."""
    try:
        repository.delete_recipe(session, recipe_id)
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
