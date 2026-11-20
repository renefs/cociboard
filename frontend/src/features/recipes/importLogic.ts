import type { TFunction } from "i18next";
import { ApiError } from "../../api/client";
import type { ImportErrorCode, RecipeDraft } from "../../api/types";
import { SOURCE_URL_MAX_LENGTH } from "../../api/types";
import { emptyValues, sourceHost, type RecipeFormValues } from "./recipeFormLogic";

/** Longest link the server accepts for an import. */
export const IMPORT_URL_MAX_LENGTH = 2000;

/**
 * The link to send: trimmed, and a bare "example.com/recipe" gets `https://`. Returns null
 * for anything that is not an http(s) link, so the form can explain instead of calling the API.
 */
export function normalizeImportUrl(input: string): string | null {
  let text = input.trim();
  if (text === "" || /\s/.test(text) || text.length > IMPORT_URL_MAX_LENGTH) return null;
  if (!text.includes("://") && /^[^/?#:]+\.[^/?#:]+/.test(text)) text = `https://${text}`;
  try {
    const parsed = new URL(text);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname !== "" ? text : null;
  } catch {
    return null;
  }
}

/** Whether the user already typed something an import would overwrite. */
export function hasTypedContent(values: RecipeFormValues): boolean {
  const blank = emptyValues();
  const filled = (list: readonly string[]) => list.some((item) => item.trim() !== "");
  return (
    values.name.trim() !== blank.name ||
    values.description.trim() !== "" ||
    values.prepMinutes.trim() !== "" ||
    values.servings.trim() !== "" ||
    values.sourceUrl.trim() !== "" ||
    filled(values.ingredients) ||
    filled(values.steps)
  );
}

/**
 * The form values after an import. The meal type, protein and properties are not in the
 * draft, so they stay as the user set them.
 */
export function applyDraft(values: RecipeFormValues, draft: RecipeDraft): RecipeFormValues {
  return {
    ...values,
    name: draft.name,
    description: draft.description ?? "",
    prepMinutes: draft.prep_minutes === null ? "" : String(draft.prep_minutes),
    servings: draft.servings === null ? "" : String(draft.servings),
    ingredients: draft.ingredients.length > 0 ? [...draft.ingredients] : [""],
    steps: [...draft.steps],
    sourceUrl:
      draft.source_url !== null && draft.source_url.length <= SOURCE_URL_MAX_LENGTH ? draft.source_url : "",
  };
}

/** The site an import came from, for the status line. */
export function importedHost(draft: RecipeDraft, requestedUrl: string): string {
  return sourceHost(draft.source_url ?? "") ?? sourceHost(requestedUrl) ?? requestedUrl;
}

/** The translated warnings of a draft, in the order the server gave them. */
export function describeWarnings(draft: RecipeDraft, t: TFunction): string[] {
  return draft.warnings.map((code) => t(`recipeForm.import.warnings.${code}`));
}

/** The server answered that the import is turned off (`COCIBOARD_RECIPE_IMPORT=false`). */
export function isImportDisabled(error: unknown): boolean {
  return importCode(error) === "import_disabled";
}

function importCode(error: unknown): ImportErrorCode | null {
  if (!(error instanceof ApiError)) return null;
  const detail = error.detail;
  if (typeof detail === "object" && detail !== null && "code" in detail) {
    return String((detail as { code: unknown }).code) as ImportErrorCode;
  }
  return null;
}

function importStatus(error: ApiError): number | null {
  const detail = error.detail as { status?: unknown } | null | undefined;
  return typeof detail === "object" && detail !== null && typeof detail.status === "number"
    ? detail.status
    : null;
}

/** A friendly, translated sentence for a failed import. */
export function describeImportError(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t("recipeForm.import.errors.network");
  switch (importCode(error)) {
    case "invalid_url":
      return t("recipeForm.import.errors.invalidUrl");
    case "blocked_address":
      return t("recipeForm.import.errors.blockedAddress");
    case "fetch_failed": {
      const status = importStatus(error);
      return status === null
        ? t("recipeForm.import.errors.fetchFailed")
        : t("recipeForm.import.errors.fetchFailedStatus", { status });
    }
    case "timeout":
      return t("recipeForm.import.errors.timeout");
    case "too_large":
      return t("recipeForm.import.errors.tooLarge");
    case "not_html":
      return t("recipeForm.import.errors.notHtml");
    case "no_recipe_found":
      return t("recipeForm.import.errors.noRecipeFound");
    case "busy":
      return t("recipeForm.import.errors.busy");
    default:
      return t("recipeForm.import.errors.failed");
  }
}

