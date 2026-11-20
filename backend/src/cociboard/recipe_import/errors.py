"""Failure codes of the recipe import."""

from typing import Literal

ImportErrorCode = Literal[
    "invalid_url",
    "blocked_address",
    "fetch_failed",
    "timeout",
    "too_large",
    "not_html",
    "no_recipe_found",
    "busy",
]

# HTTP status of each code (``import_disabled`` is raised by the router, not here).
HTTP_STATUS: dict[str, int] = {
    "invalid_url": 422,
    "blocked_address": 422,
    "fetch_failed": 502,
    "timeout": 504,
    "too_large": 413,
    "not_html": 415,
    "no_recipe_found": 422,
    "busy": 429,
}


class ImportFailure(Exception):
    """An import that cannot continue. ``status`` is the remote HTTP status, when there is one."""

    def __init__(self, code: ImportErrorCode, status: int | None = None) -> None:
        super().__init__(code)
        self.code: ImportErrorCode = code
        self.status = status
