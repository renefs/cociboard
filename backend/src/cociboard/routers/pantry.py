"""``/api/pantry`` endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session

from cociboard import pantry_repo
from cociboard.db import get_session
from cociboard.schemas import PantryCreate, PantryItemRead, PantryRead

router = APIRouter(prefix="/pantry", tags=["pantry"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=PantryRead)
def get_pantry(session: SessionDep) -> PantryRead:
    """The pantry staples plus suggestions from recipe frequency."""
    return pantry_repo.get_pantry(session)


@router.post("", response_model=PantryItemRead, status_code=status.HTTP_201_CREATED)
def add_to_pantry(body: PantryCreate, session: SessionDep, response: Response) -> PantryItemRead:
    """Add a staple: 201, or 200 with the existing item when its key is already there."""
    try:
        item, created = pantry_repo.add_item(session, body.name)
    except pantry_repo.EmptyKeyError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "name must contain letters or digits"
        ) from None
    if not created:
        response.status_code = status.HTTP_200_OK
    return PantryItemRead.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_pantry(item_id: int, session: SessionDep) -> None:
    """Remove a staple (404 if missing)."""
    try:
        pantry_repo.delete_item(session, item_id)
    except pantry_repo.PantryItemNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Pantry item {item_id} not found") from None
