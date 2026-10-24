"""API schemas. The frontend mirrors these in ``frontend/src/api/types.ts``."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response of ``GET /api/health``."""

    status: str
    version: str
