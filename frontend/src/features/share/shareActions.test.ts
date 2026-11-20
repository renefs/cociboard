import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, shareOrCopy, shareOrDownloadFile } from "./shareActions";

const abort = () => Object.assign(new Error("cancelled"), { name: "AbortError" });

function stubNavigator(parts: Record<string, unknown>) {
  vi.stubGlobal("navigator", parts);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shareOrCopy", () => {
  const input = { title: "Menu", text: "Monday" };

  it("shares through the system sheet when it exists", async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    expect(await shareOrCopy(input)).toBe("shared");
    expect(share).toHaveBeenCalledWith(input);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports a dismissed share sheet as cancelled and does not copy", async () => {
    const writeText = vi.fn();
    stubNavigator({ share: () => Promise.reject(abort()), clipboard: { writeText } });
    expect(await shareOrCopy(input)).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when sharing fails for another reason", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator({ share: () => Promise.reject(new Error("nope")), clipboard: { writeText } });
    expect(await shareOrCopy(input)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Monday");
  });

  it("copies when there is no share sheet", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator({ clipboard: { writeText } });
    expect(await shareOrCopy(input)).toBe("copied");
  });

  it("asks for a manual copy when the clipboard is missing", async () => {
    stubNavigator({});
    expect(await shareOrCopy(input)).toBe("manual");
  });

  it("asks for a manual copy when the clipboard refuses", async () => {
    stubNavigator({ clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    expect(await shareOrCopy(input)).toBe("manual");
  });
});

describe("shareOrDownloadFile", () => {
  const file = new File(["BEGIN:VCALENDAR"], "cociboard-2026-11-16.ics", { type: "text/calendar" });

  function stubTouch(coarse: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: coarse && query === "(pointer: coarse)" }));
  }

  function stubUrl() {
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    return { create, revoke, click };
  }

  it("shares the file on a touch device that can share files", async () => {
    stubTouch(true);
    const share = vi.fn(() => Promise.resolve());
    stubNavigator({ canShare: () => true, share });
    expect(await shareOrDownloadFile(file)).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file] }));
  });

  it("treats a dismissed sheet as cancelled", async () => {
    stubTouch(true);
    stubNavigator({ canShare: () => true, share: () => Promise.reject(abort()) });
    expect(await shareOrDownloadFile(file)).toBe("cancelled");
  });

  it("downloads on a desktop even when file sharing exists", async () => {
    stubTouch(false);
    const share = vi.fn();
    stubNavigator({ canShare: () => true, share });
    const { click } = stubUrl();
    expect(await shareOrDownloadFile(file)).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("downloads when sharing the file fails", async () => {
    stubTouch(true);
    stubNavigator({ canShare: () => true, share: () => Promise.reject(new Error("no")) });
    const { click } = stubUrl();
    expect(await shareOrDownloadFile(file)).toBe("downloaded");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});

describe("downloadFile", () => {
  it("clicks a temporary download link and revokes the object URL afterwards", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    let download = "";
    let href: string | null = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      download = this.download;
      href = this.getAttribute("href");
    });
    downloadFile(new File(["x"], "menu.ics"));
    expect(download).toBe("menu.ics");
    expect(href).toBe("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    click.mockRestore();
  });
});
