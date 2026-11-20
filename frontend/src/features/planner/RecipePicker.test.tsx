import { screen } from "@testing-library/react";
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
