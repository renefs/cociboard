import type {
  AuthStatus,
  Candidate,
  HealthResponse,
  LoginBody,
  MealSlot,
  Recipe,
  RecipeCreate,
  RecipeFilters,
  RecipeUpdate,
  RecipeUsage,
  RestoreResult,
  SlotAssignBody,
  SlotFill,
  ShoppingExtraUpdate,
  ShoppingList,
  SlotMoveRequest,
  WeekCopyResult,
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

let unauthorizedHandler: (() => void) | null = null;

/** Called whenever the server answers `401 auth_required` (an expired or missing session). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function failure(path: string, response: Response): Promise<ApiError> {
  const detail = await readDetail(response);
  if (
    response.status === 401 &&
    typeof detail === "object" &&
    detail !== null &&
    (detail as { code?: unknown }).code === "auth_required"
  ) {
    unauthorizedHandler?.();
  }
  return new ApiError(response.status, `Request to ${path} failed with ${response.status}`, detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) throw await failure(path, response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { signal: signal ?? null });
}

export function getAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
  return request<AuthStatus>("/auth/status", { signal: signal ?? null });
}

/** Rejects with `ApiError` 401 (`invalid_password`) or 429 (`too_many_attempts`). */
export function login(password: string): Promise<void> {
  const body: LoginBody = { password };
  return request<void>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

export function listRecipes(filters: RecipeFilters = {}, signal?: AbortSignal): Promise<Recipe[]> {
  const params = new URLSearchParams();
  if (filters.slot) params.set("slot", filters.slot);
  if (filters.archived) params.set("archived", "true");
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
  body: SlotAssignBody,
): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}/days/${day}/${slot}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Set or clear (`null`) the note of a filled slot. */
export function setSlotNote(
  weekStart: string,
  day: number,
  slot: MealSlot,
  note: string | null,
): Promise<WeekPlan> {
  return request<WeekPlan>(`/weeks/${weekStart}/days/${day}/${slot}/note`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ note }),
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

/** Copy another week's meals into the empty slots of `weekStart` (never overwrites). */
export function copyWeek(weekStart: string, fromWeekStart: string): Promise<WeekCopyResult> {
  return request<WeekCopyResult>(`/weeks/${weekStart}/copy`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ from_week_start: fromWeekStart }),
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

const shoppingPath = (weekStart: string) => `/weeks/${weekStart}/shopping-list`;

export function getShoppingList(weekStart: string, signal?: AbortSignal): Promise<ShoppingList> {
  return request<ShoppingList>(shoppingPath(weekStart), { signal: signal ?? null });
}

/** Tick or untick a generated item by its `key` (idempotent). */
export function setShoppingCheck(
  weekStart: string,
  key: string,
  checked: boolean,
): Promise<ShoppingList> {
  return request<ShoppingList>(`${shoppingPath(weekStart)}/checks`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ key, checked }),
  });
}

/** Untick every item and extra of the week. */
export function uncheckShoppingList(weekStart: string): Promise<ShoppingList> {
  return request<ShoppingList>(`${shoppingPath(weekStart)}/checks`, { method: "DELETE" });
}

export function addShoppingExtra(weekStart: string, name: string): Promise<ShoppingList> {
  return request<ShoppingList>(`${shoppingPath(weekStart)}/extras`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export function updateShoppingExtra(
  weekStart: string,
  id: number,
  changes: ShoppingExtraUpdate,
): Promise<ShoppingList> {
  return request<ShoppingList>(`${shoppingPath(weekStart)}/extras/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(changes),
  });
}

export function deleteShoppingExtra(weekStart: string, id: number): Promise<ShoppingList> {
  return request<ShoppingList>(`${shoppingPath(weekStart)}/extras/${id}`, { method: "DELETE" });
}

/** A downloaded backup: the JSON text and the file name suggested by the server. */
export interface BackupDownload {
  blob: Blob;
  filename: string;
}

/** File name from a `Content-Disposition: attachment; filename="..."` header. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header ? /filename="([^"\\/]+)"/.exec(header) : null;
  return match?.[1] ?? fallback;
}

export async function downloadBackup(): Promise<BackupDownload> {
  const response = await fetch("/api/backup", { headers: { Accept: "application/json" } });
  if (!response.ok) throw await failure("/backup", response);
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(
      response.headers.get("Content-Disposition"),
      "cociboard-backup.json",
    ),
  };
}

/** Replace all data with the given backup document (already parsed from the file). */
export function restoreBackup(document: unknown): Promise<RestoreResult> {
  return request<RestoreResult>("/backup/restore", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(document),
  });
}
