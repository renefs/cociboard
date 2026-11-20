import pytest

from cociboard.domain import (
    MealSlot,
    MealType,
    clean_source_url,
    clean_steps,
    fits_slot,
    fold_text,
)


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


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Albóndigas", "albondigas"),
        ("PIÑA", "pina"),
        ("Pingüino", "pinguino"),
        ("Crème Brûlée", "creme brulee"),
        ("plain", "plain"),
    ],
)
def test_fold_text(text: str, expected: str) -> None:
    assert fold_text(text) == expected


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://example.com/a/b?x=1#frag",
        "  https://example.com  ",
        "HTTPS://Example.COM",
    ],
)
def test_clean_source_url_accepts_http_and_https(url: str) -> None:
    assert clean_source_url(url) == url.strip()


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "data:text/html,<script>1</script>",
        "ftp://example.com/x",
        "/relative/path",
        "example.com/recipe",
        "https://",
        "http:///nohost",
        "mailto:a@b.c",
        "https://exa mple.com",
        "https://example.com/" + "a" * 500,
        "https://[::1",
    ],
)
def test_clean_source_url_rejects_unsafe_or_malformed(url: str) -> None:
    with pytest.raises(ValueError):
        clean_source_url(url)


def test_clean_source_url_blank_is_none() -> None:
    assert clean_source_url(None) is None
    assert clean_source_url("   ") is None


def test_clean_steps_trims_and_drops_empty() -> None:
    assert clean_steps(["  Chop ", "", "   ", "Cook"]) == ["Chop", "Cook"]


def test_clean_steps_limits() -> None:
    assert len(clean_steps(["x"] * 50)) == 50
    with pytest.raises(ValueError):
        clean_steps(["x"] * 51)
    assert clean_steps(["x" * 1000]) == ["x" * 1000]
    with pytest.raises(ValueError):
        clean_steps(["x" * 1001])
    assert len(clean_steps(["x", ""] * 50)) == 50  # empty steps do not count
