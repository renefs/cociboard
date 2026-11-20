import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test as base, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import i18next, { type TFunction } from "i18next";
import en from "../src/i18n/locales/en";
import es from "../src/i18n/locales/es";
import { addDays, dayName, parseIsoDate, toIsoDate, weekStartOf } from "../src/features/planner/weekMath";
import { TIMEZONE } from "../playwright.config";

export type Language = "en" | "es";

/** Where the guide's pages look for their pictures: userguide/docs/<language>/images/. */
const IMAGES = resolve(import.meta.dirname, "../../userguide/docs");

/** Today's date in the app's time zone (the server and the browser both use it). */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function currentWeekStart(): string {
  return weekStartOf(parseIsoDate(todayIso()));
}

export function shiftDays(iso: string, days: number): string {
  return toIsoDate(addDays(parseIsoDate(iso), days));
}

interface GuideFixtures {
  language: Language;
  /** The app's own catalogue in the page's language, so locators follow the UI text. */
  t: TFunction;
  /** The localised name of a slot group in the grid ("Monday lunch", "comida del lunes"). */
  slot: (day: number, meal: "lunch" | "dinner") => Locator;
  /** Writes a PNG for the guide: the whole viewport, or one element. */
  shot: (name: string, target?: Locator) => Promise<void>;
}

export const test = base.extend<GuideFixtures>({
  // Set per project in playwright.userguide.config.ts.
  language: ["en", { option: true }],

  t: async ({ language }, use) => {
    const instance = i18next.createInstance();
    await instance.init({ lng: language, resources: { en: { translation: en }, es: { translation: es } } });
    await use(instance.t);
  },

  page: async ({ page, language }, use) => {
    await page.addInitScript((lang) => {
      try {
        window.localStorage.setItem("cociboard.language", lang);
      } catch {
        // storage unavailable: the browser locale gives the same language
      }
    }, language);
    await use(page);
  },

  slot: async ({ page, t, language }, use) => {
    await use((day, meal) => {
      const label = t(`planner.slotName.${meal}`, {
        day: dayName(day, language),
        dayLower: dayName(day, language, false),
      });
      return page.getByRole("group", { name: label, exact: true });
    });
  },

  shot: async ({ page, language }, use) => {
    await use(async (name, target) => {
      const path = `${IMAGES}/${language}/images/${name}.png`;
      mkdirSync(dirname(path), { recursive: true });
      // Let fonts, images and the last re-render settle.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      if (target) await target.screenshot({ path, animations: "disabled" });
      else await page.screenshot({ path, animations: "disabled" });
    });
  },
});

export { expect };

interface Recipe {
  id: number;
  name: string;
}

type Entry = { recipe: string; note?: string } | { special: "eating_out" | "leftovers" | "free"; note?: string };

/** The demo week: [day][lunch, dinner]. `null` leaves the slot empty for the picker pictures. */
const THIS_WEEK: [Entry | null, Entry | null][] = [
  [{ recipe: "Fabada asturiana", note: "double batch" }, { recipe: "Tortilla de espinacas" }],
  [{ recipe: "Pollo al ajillo" }, { recipe: "Crema de verduras" }],
  [{ recipe: "Merluza en salsa verde" }, { recipe: "Huevos rotos con jamón" }],
  [{ recipe: "Potaje de calabaza y garbanzos" }, null],
  [{ recipe: "Patatas a la riojana" }, { recipe: "Canelones de espinacas" }],
  [{ recipe: "Arroz negro" }, { special: "eating_out", note: "Ana's birthday" }],
  [{ recipe: "Rabo de toro estofado" }, { recipe: "Judías verdes con patatas" }],
];

const LAST_WEEK: [Entry | null, Entry | null][] = [
  [{ recipe: "Fideuá" }, { recipe: "Pimientos del piquillo rellenos" }],
  [{ recipe: "Fabada asturiana" }, { recipe: "Sardinas a la plancha" }],
  [{ recipe: "Pollo al ajillo" }, { recipe: "Berenjenas rellenas" }],
  [null, null],
  [null, null],
  [null, null],
  [null, null],
];

async function recipesByName(request: APIRequestContext): Promise<Map<string, number>> {
  const response = await request.get("/api/recipes");
  expect(response.ok()).toBe(true);
  const recipes = (await response.json()) as Recipe[];
  return new Map(recipes.map((recipe) => [recipe.name, recipe.id]));
}

async function putWeek(
  request: APIRequestContext,
  weekStart: string,
  plan: [Entry | null, Entry | null][],
  ids: Map<string, number>,
  language: Language,
): Promise<void> {
  type Slot = { day: number; slot: "lunch" | "dinner"; note?: string } & (
    { recipe_id: number } | { special: string }
  );
  const slots = plan.flatMap((pair, day) =>
    (["lunch", "dinner"] as const).flatMap((meal, index): Slot[] => {
      const entry = pair[index];
      if (!entry) return [];
      const note = entry.note ? translateNote(entry.note, language) : undefined;
      if ("special" in entry) return [{ day, slot: meal, special: entry.special, note }];
      const id = ids.get(entry.recipe);
      if (id === undefined) throw new Error(`Seed recipe not found: ${entry.recipe}`);
      return [{ day, slot: meal, recipe_id: id, note }];
    }),
  );
  const response = await request.put(`/api/weeks/${weekStart}`, { data: { slots } });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Notes are user content, but a Spanish household writes them in Spanish. */
function translateNote(note: string, language: Language): string {
  if (language === "en") return note;
  return { "double batch": "doble ración", "Ana's birthday": "cumple de Ana" }[note] ?? note;
}

/**
 * Puts the demo data in place: this week and last week planned, a clean shopping list and a
 * small pantry, default household preferences. Idempotent, so every picture starts the same.
 */
export async function prepareDemo(request: APIRequestContext, language: Language): Promise<void> {
  const ids = await recipesByName(request);
  const week = currentWeekStart();
  await putWeek(request, week, THIS_WEEK, ids, language);
  await putWeek(request, shiftDays(week, -7), LAST_WEEK, ids, language);
  await request.delete(`/api/weeks/${shiftDays(week, 7)}`);
  await request.delete(`/api/weeks/${week}/shopping-list/checks`);
  const pantry = (await (await request.get("/api/pantry")).json()) as { items: { id: number }[] };
  for (const item of pantry.items) await request.delete(`/api/pantry/${item.id}`);
  for (const name of ["Sal", "Aceite de oliva"]) await request.post("/api/pantry", { data: { name } });
  const settings = await request.put("/api/settings/household", {
    data: {
      required_properties: [],
      avoided_properties: [],
      max_meals_per_protein: 4,
      min_vegetarian_meals: 2,
      min_fish_meals: 2,
      lunch_time: "14:00",
      dinner_time: "21:00",
    },
  });
  expect(settings.ok(), await settings.text()).toBe(true);
}

/** Opens the app on the current week and waits for the plan to load. */
export async function openPlanner(page: Page, t: TFunction): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: t("planner.heading") })).toBeVisible();
  await expect(page.getByText(t("planner.loadingWeek"))).toHaveCount(0);
}
