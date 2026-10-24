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
