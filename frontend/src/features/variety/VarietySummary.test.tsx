import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VarietyReport } from "../../api/types";
import { PROTEIN_META } from "../recipes/recipeMeta";
import { issueId } from "./varietyLogic";
import { VarietySummary } from "./VarietySummary";

const base: VarietyReport = { score: 100, filled_slots: 6, issues: [], protein_counts: {} };

const withIssues: VarietyReport = {
  score: 55,
  filled_slots: 12,
  protein_counts: { meat: 5, fish: 1 },
  issues: [
    {
      kind: "protein_overload",
      severity: "warning",
      message: "Meat is the main protein in 5 meals (more than 4).",
      params: { protein: "meat", count: 5, max: 4 },
      slots: [{ day: 0, slot: "lunch" }],
    },
    {
      kind: "little_fish",
      severity: "info",
      message: "Only 1 fish or seafood meal so far. Aim for at least 2.",
      params: { count: 1, min: 2 },
      slots: [],
    },
  ],
};

function setup(variety: VarietyReport, highlightedId: string | null = null) {
  const onHighlight = vi.fn();
  render(<VarietySummary variety={variety} highlightedId={highlightedId} onHighlight={onHighlight} />);
  return { onHighlight };
}

describe("VarietySummary", () => {
  it("shows 'not enough data' for an empty plan", async () => {
    const user = userEvent.setup();
    setup({ ...base, score: null, filled_slots: 0 });
    const badge = screen.getByRole("button", { name: "Variety: not enough data yet" });
    expect(badge).toHaveClass("variety-badge--none");
    await user.click(badge);
    expect(screen.getByText(/Plan a few meals/)).toBeVisible();
  });

  it("is colour-coded by score and starts collapsed", () => {
    const { rerender } = render(
      <VarietySummary variety={base} highlightedId={null} onHighlight={vi.fn()} />,
    );
    const badge = screen.getByRole("button", { name: /^100 Variety: No issues \(score out of 100\)/ });
    expect(badge).toHaveClass("variety-badge--good");
    expect(badge).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Nice and varied/)).not.toBeVisible();
    rerender(<VarietySummary variety={withIssues} highlightedId={null} onHighlight={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^55 Variety/ })).toHaveClass("variety-badge--poor");
  });

  it("lists issues with severity text and protein counts when expanded", async () => {
    const user = userEvent.setup();
    setup(withIssues);
    await user.click(screen.getByRole("button", { name: /^55 Variety/ }));
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    expect(screen.getByText(/Tip:/)).toBeInTheDocument();
    expect(screen.getByText(/Meat is the main protein in 5 meals/)).toBeVisible();
    const counts = screen.getByRole("list", { name: "Meals per main protein" });
    expect(within(counts).getByText(/Meat/)).toHaveTextContent("×5");
  });

  it("toggles the highlight of an issue's slots; plan-wide tips are not clickable", async () => {
    const user = userEvent.setup();
    const { onHighlight } = setup(withIssues);
    await user.click(screen.getByRole("button", { name: /^55 Variety/ }));
    await user.click(screen.getByRole("button", { name: /Meat is the main protein/ }));
    expect(onHighlight).toHaveBeenCalledWith(issueId(withIssues.issues[0]!));
    expect(screen.queryByRole("button", { name: /Only 1 fish/ })).not.toBeInTheDocument();
  });

  it("clears the highlight when the pressed issue is clicked again", async () => {
    const user = userEvent.setup();
    const id = issueId(withIssues.issues[0]!);
    const { onHighlight } = setup(withIssues, id);
    await user.click(screen.getByRole("button", { name: /^55 Variety/ }));
    const issue = screen.getByRole("button", { name: /Meat is the main protein/ });
    expect(issue).toHaveAttribute("aria-pressed", "true");
    await user.click(issue);
    expect(onHighlight).toHaveBeenCalledWith(null);
  });
});

describe("VarietySummary bar", () => {
  it("draws one segment per protein, as wide as its share, hidden from assistive technology", () => {
    setup(withIssues);
    const bar = document.querySelector(".variety-bar") as HTMLElement;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    const segments = Array.from(bar.querySelectorAll<HTMLElement>(".variety-segment"));
    expect(segments).toHaveLength(2);
    // Meat 5 of 6 and fish 1 of 6, in catalogue order.
    expect(parseFloat(segments[0]?.style.width ?? "")).toBeCloseTo(83.33, 1);
    expect(parseFloat(segments[1]?.style.width ?? "")).toBeCloseTo(16.67, 1);
    expect(segments[0]?.style.getPropertyValue("--protein-color")).toBe(PROTEIN_META.meat.color);
    expect(segments[0]?.style.getPropertyValue("--protein-color-dark")).toBe(PROTEIN_META.meat.darkColor);
  });

  it("is an empty track when nothing is planned, and does not change the button name", () => {
    setup({ ...base, score: null, filled_slots: 0 });
    expect(document.querySelectorAll(".variety-segment")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Variety: not enough data yet" })).toBeInTheDocument();
  });

  it("keeps the counts in the panel with a colour dot per protein", async () => {
    const user = userEvent.setup();
    setup(withIssues);
    await user.click(screen.getByRole("button", { name: /^55 Variety/ }));
    const counts = screen.getByRole("list", { name: "Meals per main protein" });
    expect(within(counts).getByText(/Meat/)).toBeInTheDocument();
    expect(counts.querySelectorAll(".protein-dot")).toHaveLength(2);
  });
});
