import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { escapeText, foldLine, icsFileName, weekAsIcs } from "./ical";

const en = i18n.getFixedT("en");
const NOW = new Date(Date.UTC(2026, 10, 20, 9, 5, 7));
const bytes = (text: string) => new TextEncoder().encode(text).length;

const lentils = makeRecipe({
  id: 1,
  name: "Lentejas",
  ingredients: ["Lentejas", "Chorizo"],
  source_url: "https://example.com/lentejas",
});
const tortilla = makeRecipe({ id: 2, name: "Tortilla", meal_type: "both", ingredients: [] });

/** The unfolded content lines of an export. */
const linesOf = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and line breaks", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds at 75 octets with CRLF + space, and unfolding restores the line", () => {
    const line = `DESCRIPTION:${"abcdefghij".repeat(20)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(bytes(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((part) => part.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("counts UTF-8 bytes and never splits a multi-byte character or an emoji", () => {
    const line = `SUMMARY:${"áéíóú".repeat(12)}${"🍝".repeat(10)}ñ`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    for (const part of parts) expect(bytes(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    // Each part is valid text: re-encoding it loses nothing.
    for (const part of parts) expect(new TextDecoder().decode(new TextEncoder().encode(part))).toBe(part);
  });
});

describe("weekAsIcs", () => {
  const plan = makePlan("2026-11-16", { "0:lunch": lentils, "0:dinner": tortilla }, undefined, {
    specials: { "2:lunch": "eating_out" },
    notes: { "0:lunch": "Soak; overnight, please", "2:lunch": "With Ana" },
  });
  const ics = weekAsIcs(plan, en, { now: NOW, version: "0.22.0" });
  const lines = linesOf(ics);

  it("is a CRLF-terminated VCALENDAR with the product id", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines).toContain("PRODID:-//Cociboard//Cociboard 0.22.0//EN");
    expect(lines).toContain("CALSCALE:GREGORIAN");
  });

  it("omits the version from PRODID when none is given", () => {
    expect(weekAsIcs(plan, en, { now: NOW })).toContain("PRODID:-//Cociboard//Cociboard//EN");
  });

  it("writes one event per filled slot, skipping empty ones", () => {
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(3);
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(3);
  });

  it("uses stable UIDs from the date and slot", () => {
    const uids = lines.filter((line) => line.startsWith("UID:"));
    expect(uids).toEqual([
      "UID:2026-11-16-lunch@cociboard",
      "UID:2026-11-16-dinner@cociboard",
      "UID:2026-11-18-lunch@cociboard",
    ]);
    const later = weekAsIcs(plan, en, { now: new Date(Date.UTC(2027, 0, 1)) });
    expect(linesOf(later).filter((line) => line.startsWith("UID:"))).toEqual(uids);
  });

  it("stamps in UTC and starts and ends in floating local times", () => {
    expect(lines).toContain("DTSTAMP:20261120T090507Z");
    expect(lines).toContain("DTSTART:20261116T140000");
    expect(lines).toContain("DTEND:20261116T150000");
    expect(lines).toContain("DTSTART:20261116T210000");
    expect(lines).toContain("DTEND:20261116T220000");
    expect(lines.filter((line) => line.startsWith("DTSTART") || line.startsWith("DTEND")).some((line) => /Z$|TZID/.test(line))).toBe(false);
  });

  it("translates the summary, using the special meal's label", () => {
    expect(lines).toContain("SUMMARY:Lunch: Lentejas");
    expect(lines).toContain("SUMMARY:Dinner: Tortilla");
    expect(lines).toContain("SUMMARY:Lunch: Eating out");
    const spanish = weekAsIcs(plan, i18n.getFixedT("es"), { now: NOW });
    expect(linesOf(spanish)).toContain("SUMMARY:Cena: Tortilla");
  });

  it("describes with the note, then the ingredients, escaped", () => {
    expect(lines).toContain("DESCRIPTION:Soak\\; overnight\\, please\\nLentejas\\nChorizo");
    expect(lines).toContain("DESCRIPTION:With Ana");
    // A recipe without a note or ingredients has no description.
    const tortillaEvent = lines.slice(lines.indexOf("UID:2026-11-16-dinner@cociboard"));
    expect(tortillaEvent.slice(0, tortillaEvent.indexOf("END:VEVENT")).some((line) => line.startsWith("DESCRIPTION"))).toBe(false);
  });

  it("adds the recipe link as URL, only for recipes with one", () => {
    expect(lines.filter((line) => line.startsWith("URL:"))).toEqual(["URL:https://example.com/lentejas"]);
  });

  it("folds long lines at 75 octets", () => {
    const long = makeRecipe({ id: 3, name: "Rabo de toro estofado con garbanzos, chorizo ñoño y morcilla 🍲".repeat(3) });
    const folded = weekAsIcs(makePlan("2026-11-16", { "0:lunch": long }), en, { now: NOW });
    for (const line of folded.split("\r\n")) expect(bytes(line)).toBeLessThanOrEqual(75);
    expect(linesOf(folded).find((line) => line.startsWith("SUMMARY:"))).toContain("🍲");
  });

  it("is a valid but empty calendar for an empty week", () => {
    const empty = weekAsIcs(makePlan("2026-11-16"), en, { now: NOW });
    expect(empty).not.toContain("VEVENT");
    expect(empty.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(empty.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("icsFileName", () => {
  it("is named after the week", () => {
    expect(icsFileName("2026-11-16")).toBe("cociboard-2026-11-16.ics");
  });
});
