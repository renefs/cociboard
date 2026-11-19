"""Application settings, loaded from environment variables prefixed ``COCIBOARD_``."""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
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

    @field_validator("password", "password_hash", "secret_key", mode="before")
    @classmethod
    def _empty_is_unset(cls, value: object) -> object:
        """docker-compose passes unset variables as empty strings."""
        return None if isinstance(value, str) and not value.strip() else value


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
