# ADR-0013: Schema migrations

## Status
Accepted (supersedes the "no migration tool yet" note in ADR-0003)

## Context
Until v0.9.0 the schema was created with `SQLModel.metadata.create_all`, which adds
missing tables but never alters existing ones. The app runs on a NAS (Docker, SQLite file
in `/data`) with data from v0.8.0 or v0.9.0, and upcoming features add columns (slot notes,
recipe servings and steps, archived recipes). Updates must keep the data and need no
manual steps. Existing databases have no version table.

## Decision
- **Alembic, inside the package.** Migrations live in `cociboard/migrations/`
  (`env.py`, `script.py.mako`, `versions/`) so the non-editable Docker install ships them.
  `backend/alembic.ini` points at them with `script_location = cociboard:migrations` for
  the CLI (`make migrate`, `make migration`); the URL comes from `COCIBOARD_DATABASE_URL`
  through the settings. `env.py` also accepts an open connection, which `migrate.py` and
  the tests use.
- **Hand-written, readable revisions with fixed ids.** `0001_initial` is exactly the
  v0.8.0 schema; `0002_shopping_list` adds the v0.9.0 tables.
- **Stamping legacy databases.** A database that has tables but no `alembic_version` and
  contains the core tables (`recipe`, `mealassignment`) is stamped `0001_initial` and then
  upgraded. Missing core tables or unknown tables raise `MigrationError` instead of
  guessing.
- **Idempotent `0002`.** v0.9.0 databases already have the shopping tables from
  `create_all`, so `0002` creates a table (and its indexes) only if it is missing.
- **`run_migrations(engine)` on startup** replaces `create_all` in `init_db()`: an empty
  database is upgraded to head, a legacy one is stamped and upgraded, a versioned one is
  upgraded (no-op at head).
- **Automatic backups.** When revisions are pending and the database is a SQLite file with
  tables, it is copied first with the SQLite online backup API to
  `<db>.bak-<revision or legacy>-<UTC timestamp>`; the three newest `*.bak-*` files are
  kept. In-memory, empty and up-to-date databases are not backed up.
- **Batch mode** (`render_as_batch=True`) because SQLite cannot ALTER most things in
  place; `compare_type=True` so type changes are detected.
- **Guard test.** `test_migrations.py` runs the migrations on a fresh database and asserts
  `compare_metadata` finds no difference with the models, so a model change without a
  migration fails the build. The regular test fixtures still use `create_all` for speed.

## Consequences
- Every `models.py` change needs a reviewed migration (rule in `AGENTS.md`).
- Updating the image migrates the data automatically; a backup is the rollback path
  (stop, replace the database file, run the matching version). Downgrades are provided but
  not run automatically.
- Failed migrations leave the database as SQLite's transactional DDL allows, plus the
  backup; the app does not start on a `MigrationError`.
- Backups use disk space (at most three copies of a small file) and are not removed with
  the database.
