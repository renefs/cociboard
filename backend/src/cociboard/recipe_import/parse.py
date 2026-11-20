"""Extract a recipe draft from a page's schema.org JSON-LD. Pure, standard library only."""

import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Literal

from cociboard.domain import SERVINGS_MAX, SERVINGS_MIN, STEP_MAX_LENGTH, STEPS_MAX_COUNT
from cociboard.domain import clean_source_url as validate_source_url
from cociboard.recipe_import.errors import ImportFailure

NAME_MAX_LENGTH = 80
DESCRIPTION_MAX_LENGTH = 2000
INGREDIENTS_MAX_COUNT = 100
INGREDIENT_MAX_LENGTH = 200
MAX_MINUTES = 7 * 24 * 60  # longer "durations" are data errors
_MAX_DEPTH = 12
_MAX_NODES = 20000

ImportWarningCode = Literal[
    "name_truncated",
    "steps_truncated",
    "ingredients_truncated",
    "servings_unknown",
    "time_unknown",
    "no_ingredients",
    "no_steps",
    "name_exists",
]

_BLOCK_TAGS = frozenset({"br", "p", "li", "div", "ul", "ol", "tr", "h1", "h2", "h3", "h4"})
_DURATION = re.compile(
    r"^P(?:(?P<y>\d+)Y)?(?:(?P<mo>\d+)M)?(?:(?P<w>\d+)W)?(?:(?P<d>\d+)D)?"
    r"(?:T(?:(?P<h>\d+)H)?(?:(?P<mi>\d+)M)?(?:(?P<s>\d+(?:\.\d+)?)S)?)?$",
    re.IGNORECASE,
)


@dataclass
class ParsedRecipe:
    """The fields found on the page, already cleaned and within the recipe limits."""

    name: str
    description: str | None
    servings: int | None
    prep_minutes: int | None
    ingredients: list[str]
    steps: list[str]
    source_url: str | None
    warnings: list[ImportWarningCode] = field(default_factory=list)


class _JsonLdCollector(HTMLParser):
    """Collects the text of every ``<script type="application/ld+json">``."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._current: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "script":
            return
        kind = dict(attrs).get("type") or ""
        if kind.split(";")[0].strip().lower() == "application/ld+json":
            self._current = []

    def handle_data(self, data: str) -> None:
        if self._current is not None:
            self._current.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._current is not None:
            self.blocks.append("".join(self._current))
            self._current = None


class _TextExtractor(HTMLParser):
    """Turns a snippet of HTML into lines of text: tags dropped, entities decoded."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def text_lines(value: object) -> list[str]:
    """The non-empty, whitespace-collapsed lines of ``value`` with HTML removed."""
    if isinstance(value, bool) or not isinstance(value, str | int | float):
        return []
    extractor = _TextExtractor()
    extractor.feed(str(value))
    extractor.close()
    lines = "".join(extractor.parts).splitlines()
    return [clean for line in lines if (clean := " ".join(line.split()))]


def clean_text(value: object) -> str:
    """``value`` as one line of plain text ("" when it is not text)."""
    return " ".join(text_lines(value))


def parse_duration(value: object) -> int | None:
    """Minutes in an ISO-8601 duration (``PT1H30M``); ``None`` when invalid or zero."""
    if not isinstance(value, str):
        return None
    match = _DURATION.match(value.strip())
    if match is None or value.strip().upper() in ("P", "PT"):
        return None
    g = {key: float(v) if v else 0.0 for key, v in match.groupdict().items()}
    minutes = g["w"] * 7 * 1440 + g["d"] * 1440 + g["h"] * 60 + g["mi"] + g["s"] / 60
    # Years and months have no fixed length; durations of a recipe never use them.
    if g["y"] or g["mo"]:
        return None
    rounded = round(minutes)
    return rounded if 0 < rounded <= MAX_MINUTES else None


def parse_servings(value: object) -> int | None:
    """The first integer in a ``recipeYield`` (string, number or list) within 1-50."""
    if isinstance(value, list):
        for item in value:
            found = parse_servings(item)
            if found is not None:
                return found
        return None
    if isinstance(value, bool) or not isinstance(value, str | int | float):
        return None
    match = re.search(r"\d+", str(value))
    if match is None:
        return None
    number = int(match.group())
    return number if SERVINGS_MIN <= number <= SERVINGS_MAX else None


def json_ld_blocks(html: str) -> list[object]:
    """Every JSON-LD block of the page that parses; broken ones are skipped."""
    collector = _JsonLdCollector()
    try:
        collector.feed(html)
        collector.close()
    except (AssertionError, ValueError):  # html.parser can choke on malformed markup
        pass
    parsed: list[object] = []
    for raw in collector.blocks:
        text = raw.strip()
        text = re.sub(r"^<!--|-->$|^//<!\[CDATA\[|//\]\]>$", "", text).strip()
        try:
            parsed.append(json.loads(text, strict=False))
        except (ValueError, RecursionError):
            continue
    return parsed


def _is_recipe_type(value: object) -> bool:
    types = value if isinstance(value, list) else [value]
    return any(
        isinstance(t, str) and t.rsplit("/", 1)[-1].rsplit(":", 1)[-1] == "Recipe" for t in types
    )


def find_recipe_nodes(data: object) -> list[dict[str, object]]:
    """Every object whose ``@type`` is or contains ``Recipe``, in document order."""
    found: list[dict[str, object]] = []
    stack: list[tuple[object, int]] = [(data, 0)]
    visited = 0
    while stack and visited < _MAX_NODES:
        node, depth = stack.pop()
        visited += 1
        if depth > _MAX_DEPTH:
            continue
        if isinstance(node, dict):
            if _is_recipe_type(node.get("@type")):
                found.append(node)
            children: list[object] = list(node.values())
        elif isinstance(node, list):
            children = list(node)
        else:
            continue
        stack.extend((child, depth + 1) for child in reversed(children))
    return found


def _instruction_lines(value: object, depth: int = 0) -> list[str]:
    """Flatten ``recipeInstructions`` (text, lists, HowToStep, HowToSection) in order."""
    if depth > 6:
        return []
    if isinstance(value, str):
        return text_lines(value)
    if isinstance(value, list):
        return [line for item in value for line in _instruction_lines(item, depth + 1)]
    if isinstance(value, dict):
        if "itemListElement" in value:
            return _instruction_lines(value["itemListElement"], depth + 1)
        for key in ("text", "name"):
            lines = text_lines(value.get(key))
            if lines:
                return lines
    return []


def _ingredient_lines(value: object) -> list[str]:
    items = value if isinstance(value, list) else [value]
    return [clean for item in items if (clean := clean_text(item))]


def _minutes(node: dict[str, object]) -> int | None:
    total = parse_duration(node.get("totalTime"))
    if total is not None:
        return total
    parts = [parse_duration(node.get("prepTime")), parse_duration(node.get("cookTime"))]
    known = [p for p in parts if p is not None]
    return sum(known) if known else None


def _source_url(final_url: str, original_url: str) -> str | None:
    for candidate in (final_url, original_url):
        try:
            return validate_source_url(candidate)
        except ValueError:
            continue
    return None


def parse_recipe(html: str, final_url: str, original_url: str | None = None) -> ParsedRecipe:
    """Build a draft from the first usable Recipe on the page.

    Raises ``ImportFailure("no_recipe_found")`` when the page has none with a name.
    """
    for block in json_ld_blocks(html):
        for node in find_recipe_nodes(block):
            name = clean_text(node.get("name"))
            if name:
                return _build(node, name, final_url, original_url or final_url)
    raise ImportFailure("no_recipe_found")


def _build(node: dict[str, object], name: str, final_url: str, original_url: str) -> ParsedRecipe:
    warnings: list[ImportWarningCode] = []
    if len(name) > NAME_MAX_LENGTH:
        name = name[:NAME_MAX_LENGTH].rstrip()
        warnings.append("name_truncated")

    servings = parse_servings(node.get("recipeYield"))
    if servings is None:
        warnings.append("servings_unknown")
    minutes = _minutes(node)
    if minutes is None:
        warnings.append("time_unknown")

    ingredients = _ingredient_lines(node.get("recipeIngredient"))
    if not ingredients:
        warnings.append("no_ingredients")
    elif len(ingredients) > INGREDIENTS_MAX_COUNT or any(
        len(i) > INGREDIENT_MAX_LENGTH for i in ingredients
    ):
        ingredients = [i[:INGREDIENT_MAX_LENGTH].rstrip() for i in ingredients][
            :INGREDIENTS_MAX_COUNT
        ]
        warnings.append("ingredients_truncated")

    steps = _instruction_lines(node.get("recipeInstructions"))
    if not steps:
        warnings.append("no_steps")
    elif len(steps) > STEPS_MAX_COUNT or any(len(s) > STEP_MAX_LENGTH for s in steps):
        steps = [s[:STEP_MAX_LENGTH].rstrip() for s in steps][:STEPS_MAX_COUNT]
        warnings.append("steps_truncated")

    description = clean_text(node.get("description"))[:DESCRIPTION_MAX_LENGTH].rstrip() or None
    return ParsedRecipe(
        name=name,
        description=description,
        servings=servings,
        prep_minutes=minutes,
        ingredients=ingredients,
        steps=steps,
        source_url=_source_url(final_url, original_url),
        warnings=warnings,
    )
