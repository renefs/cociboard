import type { TFunction } from "i18next";
import { ApiError } from "../../api/client";
import {
  BACKUP_FORMAT,
  READABLE_BACKUP_VERSIONS,
  type BackupErrorCode,
  type BackupErrorDetail,
} from "../../api/types";
import { formatLongDate } from "../planner/weekMath";

/** Files above this size are not sent: the server would answer 413. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export interface BackupSummary {
  recipes: number;
  meals: number;
  shoppingItems: number;
  /** ISO date (YYYY-MM-DD) of the export, or null when the file has no usable date. */
  exportedOn: string | null;
}

export type CheckFailure = "notJson" | "wrongFormat" | "unsupportedVersion" | "incomplete";

export type BackupCheck = { ok: true; summary: BackupSummary } | { ok: false; reason: CheckFailure };

const LISTS = ["recipes", "meals", "shopping_checks", "shopping_extras"] as const;

function isoDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

/**
 * A light shape check of a parsed backup file, enough to show a trustworthy summary before the
 * destructive confirmation. The server validates everything again before touching any data.
 */
export function checkBackup(document: unknown): BackupCheck {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return { ok: false, reason: "wrongFormat" };
  }
  const doc = document as Record<string, unknown>;
  if (doc.format !== BACKUP_FORMAT) return { ok: false, reason: "wrongFormat" };
  if (typeof doc.format_version !== "number" || !READABLE_BACKUP_VERSIONS.includes(doc.format_version)) return { ok: false, reason: "unsupportedVersion" };
  if (!LISTS.every((key) => Array.isArray(doc[key]))) return { ok: false, reason: "incomplete" };
  const length = (key: (typeof LISTS)[number]) => (doc[key] as unknown[]).length;
  return {
    ok: true,
    summary: {
      recipes: length("recipes"),
      meals: length("meals"),
      shoppingItems: length("shopping_checks") + length("shopping_extras"),
      exportedOn: isoDay(doc.exported_at),
    },
  };
}

/** Parse the text of a chosen file and check it; `document` is set when the text was JSON. */
export function checkBackupText(text: string): BackupCheck & { document?: unknown } {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  return { ...checkBackup(document), document };
}

/** "33 recipes, 52 planned meals, 4 shopping items". */
export function describeCounts(
  counts: { recipes: number; meals: number; shoppingItems: number },
  t: TFunction,
): string {
  return [
    t("backup.summary.recipes", { count: counts.recipes }),
    t("backup.summary.meals", { count: counts.meals }),
    t("backup.summary.shopping", { count: counts.shoppingItems }),
  ].join(", ");
}

/** "33 recipes, 52 planned meals, 4 shopping items, exported on 19 November 2026". */
export function describeSummary(summary: BackupSummary, t: TFunction, locale: string): string {
  const counts = describeCounts(summary, t);
  return summary.exportedOn
    ? t("backup.summary.withDate", { counts, date: formatLongDate(summary.exportedOn, locale) })
    : counts;
}

export function describeCheckFailure(reason: CheckFailure, t: TFunction): string {
  return t(`backup.fileErrors.${reason}`);
}

const SERVER_CODES = [
  "invalid_document",
  "wrong_format",
  "unsupported_version",
  "duplicate_recipe_ref",
  "duplicate_recipe_name",
  "invalid_week",
  "invalid_day",
  "unknown_recipe_ref",
  "meal_does_not_fit",
  "meal_needs_recipe_or_special",
  "note_too_long",
  "duplicate_slot",
  "duplicate_shopping_check",
] as const;

function backupDetail(error: ApiError): BackupErrorDetail | null {
  const detail = error.detail as Partial<BackupErrorDetail> | string | null | undefined;
  if (typeof detail !== "object" || detail === null || typeof detail.code !== "string") return null;
  return { code: detail.code, message: detail.message ?? "", params: detail.params ?? {} };
}

/** User-facing text for a failed restore. Nothing was changed on the server in any case. */
export function describeRestoreError(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t("backup.restoreErrors.network");
  if (error.status === 413) return t("backup.restoreErrors.tooLarge");
  if (error.status === 422) {
    const detail = backupDetail(error);
    const code = SERVER_CODES.find((known) => known === detail?.code) ?? "invalid_document";
    const params = { version: "", name: "", week_start: "", recipe: "", max: "", ...detail?.params };
    return t(`backup.restoreErrors.${code}`, params);
  }
  return t("backup.restoreErrors.server");
}

/** Whether trying the same restore again can help (the server was unreachable or failed). */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

const AUTO_ERROR_CODES: readonly BackupErrorCode[] = ["disk_full", "permission_denied", "unknown"];

/** Sentence for a failed automatic copy; codes this client does not know count as `unknown`. */
export function describeAutoBackupError(code: string, t: TFunction): string {
  const known = AUTO_ERROR_CODES.find((c) => c === code) ?? "unknown";
  return t(`backup.autoErrors.${known}`);
}
