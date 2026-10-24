# ADR-0003: Recipe data model and persistence

## Status
Accepted

## Context
v0.2.0 introduces recipes. The weekly planner (v0.3.0) must know which recipes fit a
lunch or dinner slot, and the variety analysis (v0.4.0) must detect repetition. The
catalogue is small and personal, so persistence should be simple and self-contained.

## Decision
- **Meal type** is `lunch | dinner | both`. Many dishes work for either meal, and
  modelling that as one value (rather than a set of slots) keeps the API and UI simple.
  The slot rule is a pure function, `fits_slot(meal_type, slot)` in `domain.py`; the
  `slot` query filter and the future planner both use it, so the rule exists once.
- **Main protein** (`meat`, `poultry`, `fish`, `seafood`, `eggs`, `legumes`, `dairy`,
  `tofu`, `none`) is a single required enum. It is the unit for variety analysis
  ("same protein two meals in a row") and is deliberately coarse: one dominant protein
  per recipe is enough to flag monotony without ingredient-level parsing.
- **Properties** are a closed enum (vegetarian, vegan, gluten-free, dairy-free, quick,
  spicy, light, kid-friendly, batch cooking), stored de-duplicated. A closed set gives
  consistent filters and icons. Filtering by several properties means *all of them*.
- **SQLModel + SQLite.** SQLModel gives one declarative layer over SQLAlchemy with
  Pydantic integration; SQLite needs no server and suits a personal app. The database
  URL is configurable (`COCIBOARD_DATABASE_URL`).
- **`ingredients` and `properties` are JSON columns**, not child tables. They are only
  ever read and written together with their recipe, never joined or queried
  relationally, and ingredients are free text. Search over ingredients runs in Python
  on the (small) result set, which also keeps the case-insensitive matching identical
  across databases. If ingredients later need structure (quantities, shopping lists),
  they can move to a table with a migration.
- **Table models are separate from API schemas** (`models.py` vs `schemas.py`):
  `RecipeCreate`, `RecipeUpdate` (partial; explicit `null` is rejected for required
  fields) and `RecipeRead`. Validation (trimmed names 1-80 chars, at least one
  non-empty ingredient, `prep_minutes > 0`) lives in the schemas.
- Names are unique, compared case-insensitively; a clash returns `409`.
- Tables are created with `create_all` on startup; there is no migration tool yet.
  Adopt Alembic when the first schema change to existing data is needed.
- Seed data (`seed.py`, 24 recipes) is idempotent by name; it runs on startup only when
  the table is empty (`COCIBOARD_SEED_ON_STARTUP`, default true), and `make seed` tops
  up missing seed recipes on demand.

## Consequences
- Slot compatibility and filtering are unit-testable without a database or HTTP.
- JSON columns make the schema trivial now but give up SQL-level ingredient queries.
- A single protein per recipe oversimplifies mixed dishes (e.g. paella with chicken and
  seafood); acceptable for variety hints.
