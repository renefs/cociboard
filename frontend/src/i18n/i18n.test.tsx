import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { VarietyReport } from "../api/types";
import { makePlan, makeRecipe } from "../test/fixtures";
import { renderWithQuery } from "../test/utils";
import i18n, {
  LANGUAGE_STORAGE_KEY,
  createI18n,
  currentLanguage,
  getLanguagePreference,
  setLanguagePreference,
} from "./index";
import en from "./locales/en";
import es from "./locales/es";

function stubBrowserLanguages(languages: string[]) {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(languages[0] ?? "en");
}

describe("language detection", () => {
  it("follows the browser: any es-* gives Spanish", () => {
    stubBrowserLanguages(["es-ES", "en"]);
    expect(currentLanguage(createI18n())).toBe("es");
    stubBrowserLanguages(["es-MX"]);
    expect(currentLanguage(createI18n())).toBe("es");
  });

  it("uses the first browser language that is supported", () => {
    stubBrowserLanguages(["fr-FR", "es", "en"]);
    expect(currentLanguage(createI18n())).toBe("es");
  });

  it("falls back to English for unsupported languages", () => {
    stubBrowserLanguages(["fr-FR"]);
    expect(currentLanguage(createI18n())).toBe("en");
    stubBrowserLanguages(["en-GB"]);
    expect(currentLanguage(createI18n())).toBe("en");
  });

  it("lets a saved preference win over the browser", () => {
    stubBrowserLanguages(["es-ES"]);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(currentLanguage(createI18n())).toBe("en");
    stubBrowserLanguages(["en-US"]);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
    expect(currentLanguage(createI18n())).toBe("es");
  });

  it("ignores a corrupt saved value", () => {
    stubBrowserLanguages(["es-ES"]);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "klingon");
    expect(currentLanguage(createI18n())).toBe("es");
    expect(getLanguagePreference()).toBe("auto");
  });
});

describe("setLanguagePreference", () => {
  it("saves an explicit choice, and Auto forgets it and re-detects", async () => {
    stubBrowserLanguages(["es-ES"]);
    await act(() => setLanguagePreference("en"));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(currentLanguage()).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    await act(() => setLanguagePreference("auto"));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(currentLanguage()).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(getLanguagePreference()).toBe("auto");
  });
});

describe("catalogues", () => {
  const flatten = (value: unknown, prefix = ""): string[] =>
    typeof value === "string"
      ? [prefix]
      : Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
          flatten(child, prefix ? `${prefix}.${key}` : key),
        );

  it("have exactly the same keys in English and Spanish", () => {
    expect(flatten(es).sort()).toEqual(flatten(en).sort());
  });

  it("keep the same interpolation placeholders and plural variants", () => {
    // `dayLower` / `proteinLower` are the lower-case forms of `day` / `protein`.
    const placeholders = (text: string) =>
      [...new Set([...text.matchAll(/{{(\w+)}}/g)].map((m) => (m[1] ?? "").replace(/Lower$/, "")))].sort();
    const collect = (value: unknown, prefix: string, into: Map<string, string>) => {
      if (typeof value === "string") into.set(prefix, value);
      else for (const [k, v] of Object.entries(value as object)) collect(v, prefix ? `${prefix}.${k}` : k, into);
    };
    const enMap = new Map<string, string>();
    const esMap = new Map<string, string>();
    collect(en, "", enMap);
    collect(es, "", esMap);
    for (const [key, text] of enMap) {
      const spanish = esMap.get(key) ?? "";
      // Spanish may leave out `day` or `protein` where it needs no explicit mention.
      const optional = new Set(["protein"]);
      const strip = (list: string[]) => list.filter((p) => !optional.has(p));
      expect(strip(placeholders(spanish)), key).toEqual(strip(placeholders(text)));
    }
  });
});

const REPEATED: VarietyReport = {
  score: 75,
  filled_slots: 2,
  protein_counts: { legumes: 2 },
  issues: [
    {
      kind: "repeated_recipe",
      severity: "warning",
      message: "Fabada asturiana is planned 2 times this week.",
      params: { recipe: "Fabada asturiana", count: 2 },
      slots: [
        { day: 0, slot: "lunch" },
        { day: 1, slot: "lunch" },
      ],
    },
  ],
};

function stubServer() {
  const lentils = makeRecipe({ id: 1, name: "Fabada asturiana", meal_type: "lunch" });
  const plan = makePlan("2026-10-26", { "0:lunch": lentils, "1:lunch": lentils }, REPEATED);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/recipes")) return Response.json([lentils]);
      if (url.startsWith("/api/weeks")) return Response.json(plan);
      return Response.json({ status: "ok", version: "0.6.0" });
    }),
  );
}

describe("the language switcher", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("translates the UI, keeps recipe names, persists and updates <html lang>", async () => {
    const user = userEvent.setup();
    stubServer();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 28) });
    try {
      renderWithQuery(<App />);
    } finally {
      vi.useRealTimers();
    }
    expect(await screen.findByRole("heading", { name: "Weekly planner" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const group = screen.getByRole("group", { name: "Language" });
    expect(within(group).getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(group).getByRole("button", { name: "ES" }));

    expect(await screen.findByRole("heading", { name: "Planificador semanal" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "true");

    // Day headings and slot labels are Spanish, recipe names are untouched.
    expect(await screen.findByRole("group", { name: "comida del lunes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Lunes/ })).toBeInTheDocument();
    expect(screen.getAllByText("Fabada asturiana").length).toBeGreaterThan(0);
    // Plural-aware usage badge and a variety issue translated from its params.
    expect((await screen.findAllByText("Planificada 2 veces esta semana")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^75 Variedad: / }));
    expect(
      screen.getByText("Fabada asturiana se repite 2 veces esta semana."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(await screen.findByRole("heading", { name: "Weekly planner" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");

    await user.click(screen.getByRole("button", { name: "Auto" }));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("plurals", () => {
  it("use the right form per language", () => {
    const t = i18n.getFixedT("es");
    expect(t("planner.filledSlots", { count: 1 })).toBe("Se ha rellenado 1 hueco");
    expect(t("planner.filledSlots", { count: 9 })).toBe("Se han rellenado 9 huecos");
    expect(i18n.getFixedT("en")("planner.filledSlots", { count: 1 })).toBe("Filled 1 slot");
  });
});
