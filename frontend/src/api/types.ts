// Mirrors the Pydantic schemas in backend/src/cociboard/schemas.py.

export interface HealthResponse {
  status: string;
  version: string;
}
