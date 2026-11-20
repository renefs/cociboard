# ADR-0022: Automatic backups and enforced foreign keys

## Status
Accepted

## Context
Users only had a backup when they downloaded one by hand, plus the safety copies made before
a migration or a restore (ADR-0013, ADR-0014). A household app that is used for months should
not depend on someone remembering to click "Download backup".

SQLite also ignores foreign keys unless `PRAGMA foreign_keys=ON` is set on each connection.
The only key, `mealassignment.recipe_id -> recipe.id`, was therefore never enforced: the
application code deleted assignments before recipes, but a bug or a manual edit could leave a
planned meal pointing at nothing.

## Decision
**Foreign keys**
- `db.enable_sqlite_foreign_keys(engine)` registers a `connect` listener that sets the pragma
  on every new SQLite connection. It is applied in `get_engine` and in the test fixture engine,
  so tests behave like production.
- Migrations run with enforcement **off**, as Alembic documents for SQLite: batch operations
  copy and drop tables, which enforced keys would reject. `run_migrations` remembers the
  pragma, turns it off on its connection before any transaction starts, runs the upgrade,
  reports `PRAGMA foreign_key_check` and puts the pragma back in a `finally`. It restores the
  previous value rather than forcing ON, and when that cannot be verified it invalidates the
  connection so the pool opens a fresh one (with the listener). Invalidating unconditionally
  would be simpler, but it would destroy the single shared connection of an in-memory test
  database.
- After the migrations, `integrity.run_integrity_check` runs `PRAGMA quick_check` (an error is
  logged, startup goes on) and `PRAGMA foreign_key_check`. The decision is a pure function
  (`plan_integrity_fix`): rows of `mealassignment` whose parent `recipe` is missing are
  orphans; they are backed up first (`bak-integrity-`, rotated with the migration copies) and
  deleted, logging the count and the weeks. Any other violation is only logged as an error.
  If the backup fails nothing is deleted. The whole step never raises.
- `restore_backup` already deletes children before parents and inserts parents first; this is
  now covered by tests with enforcement on.

**Automatic backups**
- Copies use the SQLite online backup API (safe while the app writes) and are named
  `<db>.bak-auto-<UTC stamp>`. Copy kinds are explicit (`BackupKind`): `migration` (every label
  except the two below, including `legacy` and `integrity`) keeps 3, `pre-restore` keeps 3 and
  `auto` keeps `COCIBOARD_BACKUPS_KEPT` (default 7). Rotation only counts and deletes copies of
  the same kind, so one kind can never push out another. Existing file names are unchanged.
- `COCIBOARD_BACKUP_DIR` moves only the automatic copies (created if missing); the safety
  copies stay next to the database, where users already look for them.
- `autobackup.backup_due` (pure): never due when disabled (interval 0); otherwise due when there is no automatic copy
  yet, or the interval has passed **and** the database (main file and `-wal`) is newer than the
  last copy. A quiet fortnight therefore does not replace seven distinct states with identical
  copies. The copy's own modification time is the "last copy" time, so nothing extra is stored.
- An asyncio task started in the lifespan (only for a file database with interval > 0) checks at
  startup and then every 15 minutes; the copy runs in `asyncio.to_thread`. A failure is logged
  at ERROR and kept in memory as `{at, code}` (`disk_full`, `permission_denied`, `unknown`),
  cleared by the next success; the loop never dies. The service takes a clock and sleep so it
  is tested without waiting. A failing disk is retried at the next check (every 15 minutes).
- `GET /api/backup/status` reports `{enabled, interval_hours, kept, last_backup_at, copies,
  last_error, custom_dir}`. It sends codes, not text (ADR-0009) and no host paths, only whether
  a custom folder is used. It sits behind the auth middleware like the rest of `/api`.
- Empty settings from compose (`${VAR:-}`) mean "default", as for the password settings.

## Consequences
- Every household gets rolling copies without doing anything; restoring one is a file copy
  (documented step by step for Docker). A copy on the same disk does not protect against disk
  loss, which the README says.
- Enforced keys turn a class of silent corruption into an immediate error. Code that deletes a
  recipe must keep removing its assignments first.
- The last-failure state lives in memory: it resets when the app restarts, and a restart
  triggers a new attempt anyway.
- Changing `COCIBOARD_BACKUP_DIR` leaves old copies behind; they are neither counted nor
  rotated any more.
- The scheduler lives in the web process; running several workers would make one copy per
  worker per interval (the app runs a single worker).
