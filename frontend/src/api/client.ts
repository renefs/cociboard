import type {
  HealthResponse,
  MealSlot,
  Recipe,
  RecipeCreate,
  RecipeFilters,
  RecipeUpdate,
  SlotMoveRequest,
  WeekPlan,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { signal: signal ?? null });
}

export function listRecipes(filters: RecipeFilters = {}, signal?: AbortSignal): Promise<Recipe[]> {
  const params = new URLSearchParams();
  if (filters.slot) params.set("slot", filters.slot);
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  for (const property of filters.properties ?? []) params.append("property", property);
  const query = params.toString();
  return request<Recipe[]>(`/recipes${query ? `?${query}` : ""}`, { signal: signal ?? null });
}

export function getRecipe(id: number, signal?: AbortSignal): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}`, { signal: signal ?? null });
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function createRecipe(recipe: RecipeCreate): Promise<Recipe> {
  return request<Recipe>("/recipes", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(recipe),
  });
}

export function updateRecipe(id: number, changes: RecipeUpdate): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(changes),
  });
}

export function deleteRecipe(id: number): Promise<void> {
  return request<void>(`/recipes/${id}`, { method: "DELETE" });
}

export function getWeek(weekStart: string, signal?: AbortSignal): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}`, { signal: signal ?? null });
}

export function assignSlot(
  weekStart: string,
  day: number,
  slot: MealSlot,
  recipeId: number,
): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}/days/${day}/${slot}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ recipe_id: recipeId }),
  });
}

export function clearSlot(weekStart: string, day: number, slot: MealSlot): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}/days/${day}/${slot}`, { method: "DELETE" });
}

export function moveSlot(weekStart: string, move: SlotMoveRequest): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}/move`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(move),
  });
}
