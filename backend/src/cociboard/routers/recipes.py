"""``/api/recipes`` endpoints."""

import asyncio
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlmodel import Session

from cociboard import repository
from cociboard.config import Settings, get_settings
from cociboard.db import get_session
from cociboard.domain import MealSlot, RecipeProperty
from cociboard.history import HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT
from cociboard.recipe_import.errors import HTTP_STATUS, ImportFailure
from cociboard.recipe_import.fetch import ImportLimiter, PageFetcher, fetch_page
from cociboard.recipe_import.parse import parse_recipe
from cociboard.routers.weeks import get_today
from cociboard.schemas import (
    ConflictSlot,
    DuplicateNameDetail,
    MealTypeConflictDetail,
    RecipeCreate,
    RecipeDraft,
    RecipeHistoryRead,
    RecipeImportRequest,
    RecipeRead,
    RecipeUpdate,
    RecipeUsage,
)

router = APIRouter(prefix="/recipes", tags=["recipes"])

SessionDep = Annotated[Session, Depends(get_session)]
TodayDep = Annotated[date, Depends(get_today)]


def _not_found(recipe_id: int) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"Recipe {recipe_id} not found")


def _duplicate(exc: repository.DuplicateRecipeNameError) -> HTTPException:
    detail = DuplicateNameDetail(
        message=f"A recipe named '{exc.args[0]}' already exists", archived=exc.archived
    )
    return HTTPException(status.HTTP_409_CONFLICT, detail=detail.model_dump(mode="json"))


def get_page_fetcher() -> PageFetcher:
    """The page downloader; tests replace it so no import touches the network."""
    return fetch_page


@router.post("/import", response_model=RecipeDraft)
async def import_recipe(
    data: RecipeImportRequest,
    request: Request,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    fetch: Annotated[PageFetcher, Depends(get_page_fetcher)],
) -> RecipeDraft:
    """Read a recipe from a web page into a draft for the form (ADR-0024). Nothing is saved.

    Errors carry ``detail.code``: invalid_url, blocked_address, no_recipe_found (422),
    fetch_failed (502, with the remote ``status``), timeout (504), too_large (413),
    not_html (415), busy (429, two imports are already running), import_disabled (404).
    """
    if not settings.recipe_import:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "import_disabled"})
    limiter: ImportLimiter = request.app.state.import_limiter
    try:
        async with limiter.slot():
            page = await fetch(data.url)
            # Up to 2 MiB of HTML: parse off the event loop, still inside the slot.
            parsed = await asyncio.to_thread(parse_recipe, page.html, page.url, data.url)
    except ImportFailure as exc:
        detail: dict[str, object] = {"code": exc.code}
        if exc.status is not None:
            detail["status"] = exc.status
        raise HTTPException(HTTP_STATUS[exc.code], detail=detail) from None
    warnings = list(parsed.warnings)
    if repository.name_taken(session, parsed.name):
        warnings.append("name_exists")
    return RecipeDraft(
        name=parsed.name,
        description=parsed.description,
        servings=parsed.servings,
        prep_minutes=parsed.prep_minutes,
        ingredients=parsed.ingredients,
        steps=parsed.steps,
        source_url=parsed.source_url,
        warnings=warnings,
    )


@router.get("", response_model=list[RecipeRead])
def list_recipes(
    session: SessionDep,
    today: TodayDep,
    slot: Annotated[MealSlot | None, Query(description="Only recipes that fit this slot")] = None,
    q: Annotated[str | None, Query(description="Search in name and ingredients")] = None,
    properties: Annotated[
        list[RecipeProperty] | None,
        Query(alias="property", description="Required property; repeat to require several"),
    ] = None,
    archived: Annotated[
        bool, Query(description="true returns only archived recipes; default hides them")
    ] = False,
    favourite: Annotated[bool, Query(description="true returns only favourites")] = False,
) -> list[RecipeRead]:
    """List recipes with their history, optionally filtered. Archived ones are hidden by default."""
    recipes = repository.list_recipes(session, slot, q, properties or [], archived, favourite)
    return repository.to_reads(session, recipes, today)


@router.get("/{recipe_id}/usage", response_model=RecipeUsage)
def recipe_usage(recipe_id: int, session: SessionDep) -> RecipeUsage:
    """Return how many planned slots (across all weeks) use the recipe."""
    try:
        return RecipeUsage(count=repository.count_usage(session, recipe_id))
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None


@router.get("/{recipe_id}/history", response_model=RecipeHistoryRead)
def recipe_history(
    recipe_id: int,
    session: SessionDep,
    today: TodayDep,
    limit: Annotated[
        int, Query(ge=1, le=HISTORY_MAX_LIMIT, description="How many planned meals to return")
    ] = HISTORY_DEFAULT_LIMIT,
) -> RecipeHistoryRead:
    """Totals and the latest planned meals of a recipe, most recent first (upcoming included).

    "Made" means planned on or before the server's today (ADR-0027).
    """
    try:
        return repository.recipe_history(session, recipe_id, today, limit)
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None


@router.get("/{recipe_id}", response_model=RecipeRead)
def get_recipe(recipe_id: int, session: SessionDep, today: TodayDep) -> RecipeRead:
    """Return one recipe, with its history."""
    try:
        recipe = repository.get_recipe(session, recipe_id)
        return repository.to_reads(session, [recipe], today)[0]
    except repository.RecipeNotFoundError:
        raise _not_found(recipe_id) from None


@router.post("", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
def create_recipe(data: RecipeCreate, session: SessionDep, today: TodayDep) -> RecipeRead:
    """Create a recipe."""
    try:
        recipe = repository.create_recipe(session, data)
        return repository.to_reads(session, [recipe], today)[0]
    except repository.DuplicateRecipeNameError as exc:
        raise _duplicate(exc) from None


@router.patch("/{recipe_id}", response_model=RecipeRead)
def update_recipe(
    recipe_id: int,
    data: RecipeUpdate,
    session: SessionDep,
    today: TodayDep,
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
        recipe = repository.update_recipe(session, recipe_id, data, force=force)
        return repository.to_reads(session, [recipe], today)[0]
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
