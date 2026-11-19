import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignSlot,
  clearSlot,
  clearWeek,
  downloadBackup,
  filenameFromDisposition,
  getCandidates,
  getWeek,
  listRecipes,
  moveSlot,
  restoreBackup,
  replaceWeek,
  suggestWeek,
} from "./client";

describe("listRecipes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the query string from filters", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response("[]", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await listRecipes({ slot: "lunch", q: " pollo ", properties: ["vegan", "quick"] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/recipes?slot=lunch&q=pollo&property=vegan&property=quick");
    await listRecipes();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/recipes");
    await listRecipes({ archived: true });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/recipes?archived=true");
  });
});

describe("week endpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the assign, clear and move routes", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await getWeek("2026-10-26");
    await assignSlot("2026-10-26", 2, "dinner", { recipe_id: 7, note: null });
    await clearSlot("2026-10-26", 2, "dinner");
    await moveSlot("2026-10-26", { from_day: 0, from_slot: "lunch", to_day: 1, to_slot: "dinner" });
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", init?.body]);
    expect(calls).toEqual([
      ["/api/weeks/2026-10-26", "GET", undefined],
      ["/api/weeks/2026-10-26/days/2/dinner", "PUT", JSON.stringify({ recipe_id: 7, note: null })],
      ["/api/weeks/2026-10-26/days/2/dinner", "DELETE", undefined],
      [
        "/api/weeks/2026-10-26/move",
        "POST",
        JSON.stringify({ from_day: 0, from_slot: "lunch", to_day: 1, to_slot: "dinner" }),
      ],
    ]);
  });
});

describe("v0.4 week endpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls clear, replace, suggest and candidates with the right method and body", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const week = "2026-10-26";

    await clearWeek(week);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/weeks/${week}`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");

    await replaceWeek(week, [
      { day: 1, slot: "dinner", recipe_id: 5, special: null, note: null },
    ]);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      '{"slots":[{"day":1,"slot":"dinner","recipe_id":5,"special":null,"note":null}]}',
    );

    await suggestWeek(week);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/weeks/${week}/suggest`);
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe("{}");
    await suggestWeek(week, 7);
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe('{"seed":7}');

    await getCandidates(week, 2, "lunch");
    expect(fetchMock.mock.calls[4]?.[0]).toBe(`/api/weeks/${week}/days/2/lunch/candidates`);
  });
});

describe("backup endpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("takes the file name from the Content-Disposition header", () => {
    const header = 'attachment; filename="cociboard-backup-2026-11-19.json"';
    expect(filenameFromDisposition(header, "x.json")).toBe("cociboard-backup-2026-11-19.json");
    expect(filenameFromDisposition(null, "x.json")).toBe("x.json");
    expect(filenameFromDisposition('attachment; filename="../evil.json"', "x.json")).toBe("x.json");
  });

  it("downloads the backup blob with the server file name", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "Content-Disposition": 'attachment; filename="cociboard-backup-2026-11-19.json"' },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { blob, filename } = await downloadBackup();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/backup");
    expect(filename).toBe("cociboard-backup-2026-11-19.json");
    expect(blob.size).toBe(2);
  });

  it("posts the document and surfaces 422 details", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: { code: "wrong_format", message: "m", params: {} } }), {
          status: 422,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(restoreBackup({ a: 1 })).rejects.toMatchObject({
      status: 422,
      detail: { code: "wrong_format" },
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"a":1}');
  });
});
