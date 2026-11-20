"""``/api/settings`` endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from cociboard import household_repo
from cociboard.db import get_session
from cociboard.schemas import HouseholdSettings

router = APIRouter(prefix="/settings", tags=["settings"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/household", response_model=HouseholdSettings)
def get_household(session: SessionDep) -> HouseholdSettings:
    """The household preferences (the defaults until the first save)."""
    return household_repo.get_settings(session)


@router.put("/household", response_model=HouseholdSettings)
def put_household(body: HouseholdSettings, session: SessionDep) -> HouseholdSettings:
    """Replace the household preferences; 422 ``{detail: {code}}`` when inconsistent."""
    try:
        return household_repo.update_settings(session, body)
    except household_repo.InvalidHouseholdSettingsError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"code": exc.code}
        ) from None
