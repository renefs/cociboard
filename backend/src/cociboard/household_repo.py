"""Persistence for the household preferences (ADR-0026): a single row."""

from dataclasses import dataclass

from sqlmodel import Session

from cociboard.domain import RecipeProperty
from cociboard.household import normalised, validate_household
from cociboard.models import HouseholdSettingsRow
from cociboard.schemas import HouseholdSettings
from cociboard.variety import VarietyTargets

SETTINGS_ID = 1


class InvalidHouseholdSettingsError(ValueError):
    """The settings are inconsistent. ``code`` is for the client."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Household:
    """What the planner needs from the settings: variety targets and recipe preferences."""

    targets: VarietyTargets
    required: frozenset[str]
    avoided: frozenset[str]


def get_settings(session: Session) -> HouseholdSettings:
    """The stored settings, or the defaults when nothing has been saved yet (no write)."""
    row = session.get(HouseholdSettingsRow, SETTINGS_ID)
    if row is None:
        return HouseholdSettings()
    return HouseholdSettings(
        required_properties=[RecipeProperty(p) for p in row.required_properties],
        avoided_properties=[RecipeProperty(p) for p in row.avoided_properties],
        max_meals_per_protein=row.max_meals_per_protein,
        min_vegetarian_meals=row.min_vegetarian_meals,
        min_fish_meals=row.min_fish_meals,
        lunch_time=row.lunch_time,
        dinner_time=row.dinner_time,
    )


def check_settings(settings: HouseholdSettings) -> None:
    """Raise :class:`InvalidHouseholdSettingsError` when the settings are inconsistent."""
    code = validate_household(
        settings.required_properties,
        settings.avoided_properties,
        settings.lunch_time,
        settings.dinner_time,
    )
    if code is not None:
        raise InvalidHouseholdSettingsError(code)


def apply_settings(session: Session, settings: HouseholdSettings) -> None:
    """Upsert the row without committing (the caller owns the transaction)."""
    row = session.get(HouseholdSettingsRow, SETTINGS_ID)
    if row is None:
        row = HouseholdSettingsRow(id=SETTINGS_ID)
    row.required_properties = [p.value for p in normalised(settings.required_properties)]
    row.avoided_properties = [p.value for p in normalised(settings.avoided_properties)]
    row.max_meals_per_protein = settings.max_meals_per_protein
    row.min_vegetarian_meals = settings.min_vegetarian_meals
    row.min_fish_meals = settings.min_fish_meals
    row.lunch_time = settings.lunch_time
    row.dinner_time = settings.dinner_time
    session.add(row)


def update_settings(session: Session, settings: HouseholdSettings) -> HouseholdSettings:
    """Validate and save the full settings object; returns the stored form."""
    check_settings(settings)
    apply_settings(session, settings)
    session.commit()
    return get_settings(session)


def get_household(session: Session) -> Household:
    """The planner's view of the settings."""
    settings = get_settings(session)
    return Household(
        targets=VarietyTargets(
            max_meals_per_protein=settings.max_meals_per_protein,
            min_vegetarian_meals=settings.min_vegetarian_meals,
            min_fish_meals=settings.min_fish_meals,
        ),
        required=frozenset(p.value for p in settings.required_properties),
        avoided=frozenset(p.value for p in settings.avoided_properties),
    )
