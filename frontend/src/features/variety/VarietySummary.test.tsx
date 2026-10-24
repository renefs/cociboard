import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VarietyReport } from "../../api/types";
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
    const badge = screen.getByRole("button", { name: /Variety score 100 out of 100. No issues/ });
    expect(badge).toHaveClass("variety-badge--good");
    expect(badge).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Nice and varied/)).not.toBeVisible();
    rerender(<VarietySummary variety={withIssues} highlightedId={null} onHighlight={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Variety score 55/ })).toHaveClass("variety-badge--poor");
  });

  it("lists issues with severity text and protein counts when expanded", async () => {
    const user = userEvent.setup();
    setup(withIssues);
    await user.click(screen.getByRole("button", { name: /Variety score 55/ }));
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    expect(screen.getByText(/Tip:/)).toBeInTheDocument();
    expect(screen.getByText(/Meat is the main protein in 5 meals/)).toBeVisible();
    const counts = screen.getByRole("list", { name: "Meals per main protein" });
    expect(within(counts).getByText(/Meat/)).toHaveTextContent("×5");
  });

  it("toggles the highlight of an issue's slots; plan-wide tips are not clickable", async () => {
    const user = userEvent.setup();
    const { onHighlight } = setup(withIssues);
    await user.click(screen.getByRole("button", { name: /Variety score 55/ }));
    await user.click(screen.getByRole("button", { name: /Meat is the main protein/ }));
    expect(onHighlight).toHaveBeenCalledWith(issueId(withIssues.issues[0]!));
    expect(screen.queryByRole("button", { name: /Only 1 fish/ })).not.toBeInTheDocument();
  });

  it("clears the highlight when the pressed issue is clicked again", async () => {
    const user = userEvent.setup();
    const id = issueId(withIssues.issues[0]!);
    const { onHighlight } = setup(withIssues, id);
    await user.click(screen.getByRole("button", { name: /Variety score 55/ }));
    const issue = screen.getByRole("button", { name: /Meat is the main protein/ });
    expect(issue).toHaveAttribute("aria-pressed", "true");
    await user.click(issue);
    expect(onHighlight).toHaveBeenCalledWith(null);
  });
});
