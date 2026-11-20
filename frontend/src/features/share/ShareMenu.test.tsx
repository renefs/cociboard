import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { ShareMenu } from "./ShareMenu";

const lentils = makeRecipe({ id: 1, name: "Lentejas" });
const tortilla = makeRecipe({ id: 2, name: "Tortilla", meal_type: "both" });
const plan = makePlan("2026-11-16", { "0:lunch": lentils, "1:dinner": tortilla }, undefined, {
  specials: { "2:lunch": "leftovers" },
  notes: { "0:lunch": "soak the beans" },
});
const empty = makePlan("2026-11-16");
const onNotify = vi.fn();

beforeEach(() => {
  onNotify.mockReset();
  window.print = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelector(".print-root")?.remove();
});

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /Share/ }));
};

describe("ShareMenu popover", () => {
  it("opens and closes with aria-expanded and aria-controls", async () => {
    const user = userEvent.setup();
    render(<ShareMenu plan={plan} onNotify={onNotify} />);
    const trigger = screen.getByRole("button", { name: /Share/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print the menu" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy the menu" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add to calendar (.ics)" })).toBeEnabled();
    await user.click(trigger);
    expect(screen.queryByRole("button", { name: "Print the menu" })).not.toBeInTheDocument();
  });

  it("moves focus to the first item, and Escape closes it and focuses the trigger again", async () => {
    const user = userEvent.setup();
    render(<ShareMenu plan={plan} onNotify={onNotify} />);
    await open(user);
    expect(screen.getByRole("button", { name: "Print the menu" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Print the menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share/ })).toHaveFocus();
  });

  it("closes on a click outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Elsewhere</button>
        <ShareMenu plan={plan} onNotify={onNotify} />
      </>,
    );
    await open(user);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("button", { name: "Print the menu" })).not.toBeInTheDocument();
  });

  it("disables the items with an explanation when the week is empty", async () => {
    const user = userEvent.setup();
    render(<ShareMenu plan={empty} onNotify={onNotify} />);
    await open(user);
    expect(screen.getByRole("button", { name: "Print the menu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy the menu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to calendar (.ics)" })).toBeDisabled();
    expect(screen.getByText(/Plan at least one meal/)).toBeInTheDocument();
  });

  it("counts a special meal as a filled slot", async () => {
    const user = userEvent.setup();
    render(<ShareMenu plan={makePlan("2026-11-16", {}, undefined, { specials: { "0:lunch": "free" } })} onNotify={onNotify} />);
    await open(user);
    expect(screen.getByRole("button", { name: "Print the menu" })).toBeEnabled();
  });

  it("is disabled while the week is loading", () => {
    render(<ShareMenu plan={undefined} onNotify={onNotify} />);
    expect(screen.getByRole("button", { name: /Share/ })).toBeDisabled();
  });
});

describe("ShareMenu printing", () => {
  it("renders the menu in the print root, calls window.print and clears it afterwards", async () => {
    const user = userEvent.setup();
    render(<ShareMenu plan={plan} onNotify={onNotify} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Print the menu" }));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));

    const root = document.querySelector<HTMLElement>("body > .print-root");
    expect(root).not.toBeNull();
    expect(root).toHaveTextContent("Weekly menu: 16 Nov – 22 Nov 2026");
    expect(root?.querySelectorAll("tbody tr")).toHaveLength(7);
    expect(root?.querySelectorAll('th[scope="row"]')).toHaveLength(7);
    expect(root?.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
    const monday = root?.querySelector("tbody tr");
    expect(monday).toHaveTextContent("Monday16 Nov");
    expect(monday).toHaveTextContent("Lentejas");
    expect(monday).toHaveTextContent("soak the beans");
    expect(monday).toHaveTextContent("—");
    expect(root).toHaveTextContent("Leftovers");
    expect(root).toHaveTextContent("Tortilla");

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(root).toBeEmptyDOMElement();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});

describe("ShareMenu sharing", () => {
  it("copies the text and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    render(<ShareMenu plan={plan} onNotify={onNotify} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Copy the menu" }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("info", "Menu copied."));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Monday 16 Nov\n  Lunch: Lentejas (soak the beans)"));
    expect(screen.getByRole("button", { name: /Share/ })).toHaveFocus();
  });

  it("labels the item Share when the browser can share, and shares", async () => {
    const user = userEvent.setup();
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share });
    render(<ShareMenu plan={plan} onNotify={onNotify} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Share the menu" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Weekly menu: 16 Nov – 22 Nov 2026",
        text: expect.stringContaining("Tuesday 17 Nov"),
      }),
    );
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("shows the selectable text in a dialog when nothing else works", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: undefined });
    render(<ShareMenu plan={plan} onNotify={onNotify} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Copy the menu" }));
    const dialog = await screen.findByRole("dialog", { name: "Weekly menu: 16 Nov – 22 Nov 2026" });
    expect(dialog).toHaveTextContent("Select the text and copy it.");
    const area = screen.getByRole("textbox", { name: "Text to copy" });
    expect(area).toHaveAttribute("readonly");
    expect((area as HTMLTextAreaElement).value).toContain("Tuesday 17 Nov\n  Lunch: —\n  Dinner: Tortilla");
    await waitFor(() => expect(area).toHaveFocus());
    expect((area as HTMLTextAreaElement).selectionEnd - (area as HTMLTextAreaElement).selectionStart).toBe(
      (area as HTMLTextAreaElement).value.length,
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share/ })).toHaveFocus();
  });
});

describe("ShareMenu calendar export", () => {
  it("downloads cociboard-<week>.ics with the events", async () => {
    const user = userEvent.setup();
    let blob: Blob | undefined;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (value: Blob) => ((blob = value), "blob:x"), revokeObjectURL: vi.fn() }));
    let name = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    render(<ShareMenu plan={plan} onNotify={onNotify} now={() => new Date(Date.UTC(2026, 10, 20, 8))} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Add to calendar (.ics)" }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("info", "Calendar file downloaded: cociboard-2026-11-16.ics."));
    expect(name).toBe("cociboard-2026-11-16.ics");
    const text = await blob?.text();
    expect(text).toContain("UID:2026-11-16-lunch@cociboard");
    expect(text).toContain("DTSTAMP:20261120T080000Z");
    expect(text?.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    click.mockRestore();
  });
});
