import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { Candidate } from "../../api/types";
import { makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { RecipePicker } from "./RecipePicker";

vi.mock("../../api/client");

const candidate = (name: string, favourite: boolean): Candidate => ({
  recipe: makeRecipe({ id: favourite ? 1 : 2, name, favourite }),
  score_delta: 0,
  reason: "",
  reason_code: "fits_week",
  reason_params: {},
  good_pick: false,
});

describe("RecipePicker favourites", () => {
  it("marks favourites with a labelled star that is not a button", async () => {
    vi.mocked(client.getCandidates).mockResolvedValue([candidate("Lentejas", true), candidate("Tortilla", false)]);
    renderWithQuery(
      <RecipePicker
        title="Monday lunch"
        weekStart="2026-10-26"
        day={0}
        slot="lunch"
        onPick={vi.fn()}
        onPickSpecial={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Lentejas" });
    expect(screen.getAllByRole("img", { name: "Favourite" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /to favourites/ })).not.toBeInTheDocument();
  });
});

function renderPicker(onPick = vi.fn()) {
  renderWithQuery(
    <RecipePicker
      title="Monday lunch"
      weekStart="2026-10-26"
      day={0}
      slot="lunch"
      onPick={onPick}
      onPickSpecial={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("RecipePicker rows", () => {
  const pick = (overrides: Partial<Candidate>): Candidate => ({ ...candidate("Lentejas", false), ...overrides });

  it("tints a good pick, tags it and offers a primary Choose button; others get a plain one", async () => {
    vi.mocked(client.getCandidates).mockResolvedValue([
      pick({ good_pick: true, score_delta: 4, reason_code: "new_protein" }),
      { ...pick({}), recipe: makeRecipe({ id: 3, name: "Tortilla" }) },
    ]);
    const onPick = vi.fn();
    renderPicker(onPick);
    const best = within(await screen.findByRole("article", { name: "Lentejas" }));
    expect(within(best.getByRole("heading")).queryByText("Good pick")).not.toBeInTheDocument();
    expect(best.getByText("Good pick")).toBeInTheDocument();
    expect(best.getByRole("button", { name: "Choose Lentejas" })).toHaveClass("btn-primary");
    expect(screen.getByRole("article", { name: "Lentejas" })).toHaveClass("recipe-card--good");

    const other = screen.getByRole("article", { name: "Tortilla" });
    expect(other).not.toHaveClass("recipe-card--good");
    expect(within(other).queryByText("Good pick")).not.toBeInTheDocument();
    const choose = within(other).getByRole("button", { name: "Choose Tortilla" });
    expect(choose).not.toHaveClass("btn-primary");
    await userEvent.setup().click(choose);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Tortilla" }));
  });

  it("shows the reason on its own line, with a warning icon only when it is negative", async () => {
    vi.mocked(client.getCandidates).mockResolvedValue([
      pick({ score_delta: 4, reason_code: "new_protein" }),
      {
        ...pick({ score_delta: -15, reason_code: "twice_in_a_row", reason_params: { protein: "eggs" } }),
        recipe: makeRecipe({ id: 3, name: "Tortilla" }),
      },
    ]);
    renderPicker();
    const positive = (await screen.findByText("New protein this week")).closest("p");
    expect(positive).not.toHaveClass("pick-hint--warn");
    expect(positive?.querySelector("svg")).toBeNull();

    const negative = screen.getByText("Eggs twice in a row").closest("p");
    expect(negative).toHaveClass("pick-hint--warn");
    expect(negative?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the protein and time but neither ingredients nor properties", async () => {
    vi.mocked(client.getCandidates).mockResolvedValue([pick({})]);
    renderPicker();
    const row = within(await screen.findByRole("article", { name: "Lentejas" }));
    expect(row.getByText("Legumes")).toBeInTheDocument();
    expect(row.getByText("60 min")).toBeInTheDocument();
    expect(row.queryByRole("list")).not.toBeInTheDocument();
  });
});
