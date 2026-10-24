import type {
  Candidate,
  HealthResponse,
  MealSlot,
  Recipe,
  RecipeCreate,
  RecipeFilters,
  RecipeUpdate,
  RecipeUsage,
  SlotFill,
  SlotMoveRequest,
  WeekPlan,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  /** The `detail` of the error body: a string, a validation list or a structured object. */
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function readDetail(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "detail" in body
      ? (body as { detail: unknown }).detail
      : undefined;
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request to ${path} failed with ${response.status}`,
      await readDetail(response),
    );
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

/** `force` removes planned meals that no longer fit a changed meal type. */
export function updateRecipe(id: number, changes: RecipeUpdate, force = false): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}${force ? "?force=true" : ""}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(changes),
  });
}

export function getRecipeUsage(id: number, signal?: AbortSignal): Promise<RecipeUsage> {
  return request<RecipeUsage>(`/recipes/${id}/usage`, { signal: signal ?? null });
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

export function clearWeek(weekStart: string): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}`, { method: "DELETE" });
}

/** Replace the whole week atomically (used to undo "Suggest" and "Clear week"). */
export function replaceWeek(weekStart: string, slots: SlotFill[]): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ slots }),
  });
}

export function suggestWeek(weekStart: string, seed?: number): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}/suggest`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(seed === undefined ? {} : { seed }),
  });
}

export function getCandidates(
  weekStart: string,
  day: number,
  slot: MealSlot,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  return request<Candidate[]>(`/weeks/${weekStart}/days/${day}/${slot}/candidates`, {
    signal: signal ?? null,
  });
}
