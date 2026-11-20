"""Application settings, loaded from environment variables prefixed ``COCIBOARD_``."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration."""

    model_config = SettingsConfigDict(env_prefix="COCIBOARD_")

    database_url: str = "sqlite:///./cociboard.db"
    seed_on_startup: bool = True
    cors_origins: list[str] = ["http://localhost:5173"]
    # Built frontend (``frontend/dist``) to serve at ``/``; unset in development.
    static_dir: Path | None = None
    # Optional household password. Auth is off when neither is set. The hash wins when both
    # are; make one with `python -m cociboard.auth hash`.
    password: SecretStr | None = None
    password_hash: str | None = None
    # Signs session cookies; default: a random key stored next to the database file.
    secret_key: SecretStr | None = None
    session_days: int = 90
    # Automatic copies of the database file (ADR-0022). 0 hours turns them off.
    backup_interval_hours: int = Field(default=24, ge=0)
    # How many automatic copies are kept (the migration and restore copies are separate).
    backups_kept: int = Field(default=7, ge=1)
    # Where automatic copies go; default: next to the database file.
    backup_dir: Path | None = None

    @field_validator("password", "password_hash", "secret_key", "backup_dir", mode="before")
    @classmethod
    def _empty_is_unset(cls, value: object) -> object:
        """docker-compose passes unset variables as empty strings."""
        return None if isinstance(value, str) and not value.strip() else value

    @model_validator(mode="before")
    @classmethod
    def _empty_numbers_are_default(cls, data: object) -> object:
        """An empty number (compose ``${VAR:-}``) means "use the default"."""
        if not isinstance(data, dict):
            return data
        numbers = ("backup_interval_hours", "backups_kept")
        return {
            k: v
            for k, v in data.items()
            if not (k in numbers and isinstance(v, str) and not v.strip())
        }


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
