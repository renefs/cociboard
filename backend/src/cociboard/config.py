"""Application settings, loaded from environment variables prefixed ``COCIBOARD_``."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration."""

    model_config = SettingsConfigDict(env_prefix="COCIBOARD_")

    database_url: str = "sqlite:///./cociboard.db"
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
