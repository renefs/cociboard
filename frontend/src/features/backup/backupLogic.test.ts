import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import i18n from "../../i18n";
import {
  checkBackup,
  checkBackupText,
  describeAutoBackupError,
  describeRestoreError,
  describeSummary,
  isRetryable,
} from "./backupLogic";

const en = i18n.getFixedT("en");
const es = i18n.getFixedT("es");

const valid = {
  format: "cociboard-backup",
  format_version: 1,
  app_version: "0.11.0",
  exported_at: "2026-11-19T10:30:00+00:00",
  recipes: [{}, {}, {}],
  meals: [{}, {}],
  shopping_checks: [{}],
  shopping_extras: [{}, {}],
};

describe("checkBackup", () => {
  it("summarises a valid document", () => {
    expect(checkBackup(valid)).toEqual({
      ok: true,
      summary: { recipes: 3, meals: 2, shoppingItems: 3, exportedOn: "2026-11-19" },
    });
  });

  it("accepts a missing or odd export date", () => {
    for (const exported_at of [undefined, 5, "yesterday"]) {
      const result = checkBackup({ ...valid, exported_at });
      expect(result).toMatchObject({ ok: true, summary: { exportedOn: null } });
    }
  });

  it("accepts format versions 1, 2 and 3", () => {
    expect(checkBackup({ ...valid, format_version: 1 }).ok).toBe(true);
    expect(checkBackup({ ...valid, format_version: 2 }).ok).toBe(true);
    expect(checkBackup({ ...valid, format_version: 3 }).ok).toBe(true);
  });

  it("rejects what is not a backup of this format", () => {
    expect(checkBackup(null)).toEqual({ ok: false, reason: "wrongFormat" });
    expect(checkBackup([valid])).toEqual({ ok: false, reason: "wrongFormat" });
    expect(checkBackup({ ...valid, format: "other" })).toEqual({ ok: false, reason: "wrongFormat" });
    expect(checkBackup({ ...valid, format_version: 4 })).toEqual({ ok: false, reason: "unsupportedVersion" });
    expect(checkBackup({ ...valid, meals: undefined })).toEqual({ ok: false, reason: "incomplete" });
    expect(checkBackup({ ...valid, recipes: {} })).toEqual({ ok: false, reason: "incomplete" });
  });
});

describe("checkBackupText", () => {
  it("parses JSON and keeps the document for the upload", () => {
    const result = checkBackupText(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    expect(result.document).toEqual(valid);
  });

  it("reports text that is not JSON", () => {
    expect(checkBackupText("not json")).toEqual({ ok: false, reason: "notJson" });
  });
});

describe("describeSummary", () => {
  const summary = { recipes: 33, meals: 52, shoppingItems: 1, exportedOn: "2026-11-19" };

  it("names the counts and the export date in English", () => {
    expect(describeSummary(summary, en, "en")).toBe(
      "33 recipes, 52 planned meals, 1 shopping item, exported on 19 November 2026",
    );
  });

  it("uses Spanish plurals and dates", () => {
    expect(describeSummary(summary, es, "es")).toBe(
      "33 recetas, 52 comidas planificadas, 1 artículo de la compra, exportada el 19 de noviembre de 2026",
    );
  });

  it("leaves the date out when unknown", () => {
    expect(describeSummary({ ...summary, exportedOn: null, recipes: 1 }, en, "en")).toBe(
      "1 recipe, 52 planned meals, 1 shopping item",
    );
  });
});

describe("describeRestoreError", () => {
  const detail = (code: string, params: Record<string, string | number> = {}) =>
    new ApiError(422, "x", { code, message: "m", params });

  it("translates server codes with their parameters", () => {
    expect(describeRestoreError(detail("duplicate_recipe_name", { name: "paella" }), en)).toContain("paella");
    expect(describeRestoreError(detail("unsupported_version", { version: 3 }), en)).toContain("3");
    expect(describeRestoreError(detail("wrong_format"), es)).toContain("no es una copia");
  });

  it("falls back for unknown codes and other statuses", () => {
    expect(describeRestoreError(detail("something_new"), en)).toContain("damaged");
    expect(describeRestoreError(new ApiError(422, "x", "plain"), en)).toContain("damaged");
    expect(describeRestoreError(new ApiError(413, "x"), en)).toContain("too large");
    expect(describeRestoreError(new ApiError(500, "x"), en)).toContain("couldn't restore");
    expect(describeRestoreError(new TypeError("offline"), en)).toContain("reach the server");
  });

  it("only suggests retrying when the server could not be reached or failed", () => {
    expect(isRetryable(new TypeError("offline"))).toBe(true);
    expect(isRetryable(new ApiError(500, "x"))).toBe(true);
    expect(isRetryable(new ApiError(422, "x"))).toBe(false);
    expect(isRetryable(new ApiError(413, "x"))).toBe(false);
  });
});

describe("describeAutoBackupError", () => {
  it("names the known causes in both languages and falls back to unexpected", () => {
    expect(describeAutoBackupError("disk_full", en)).toContain("disk is full");
    expect(describeAutoBackupError("permission_denied", es)).toContain("no tiene permiso");
    expect(describeAutoBackupError("something_new", en)).toContain("unexpected error");
  });
});
