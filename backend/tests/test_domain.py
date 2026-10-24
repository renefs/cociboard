import pytest

from cociboard.domain import MealSlot, MealType, fits_slot


@pytest.mark.parametrize(
    ("meal_type", "slot", "expected"),
    [
        (MealType.lunch, MealSlot.lunch, True),
        (MealType.lunch, MealSlot.dinner, False),
        (MealType.dinner, MealSlot.dinner, True),
        (MealType.dinner, MealSlot.lunch, False),
        (MealType.both, MealSlot.lunch, True),
        (MealType.both, MealSlot.dinner, True),
    ],
)
def test_fits_slot(meal_type: MealType, slot: MealSlot, expected: bool) -> None:
    assert fits_slot(meal_type, slot) is expected


def test_week_start_for_returns_monday() -> None:
    from datetime import date

    from cociboard.domain import date_of, is_week_start, week_start_for

    assert week_start_for(date(2026, 10, 26)) == date(2026, 10, 26)  # Monday
    assert week_start_for(date(2026, 10, 25)) == date(2026, 10, 19)  # Sunday
    assert week_start_for(date(2026, 1, 1)) == date(2025, 12, 29)  # across a year boundary
    assert is_week_start(date(2026, 10, 26))
    assert not is_week_start(date(2026, 10, 27))
    assert date_of(date(2026, 10, 26), 6) == date(2026, 11, 1)
