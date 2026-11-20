import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { HouseholdSettings } from "../../api/types";
import { renderWithQuery } from "../../test/utils";
import { DEFAULT_HOUSEHOLD } from "./householdLogic";
import { HouseholdDialog } from "./HouseholdDialog";

vi.mock("../../api/client");

const onClose = vi.fn();
const onSave = vi.fn();

function renderDialog(settings: HouseholdSettings = DEFAULT_HOUSEHOLD) {
  vi.mocked(client.getHouseholdSettings).mockResolvedValue(structuredClone(settings));
  return renderWithQuery(<HouseholdDialog onClose={onClose} onSave={onSave} />);
}

const diet = () => within(screen.getByRole("group", { name: "Diet" }));
const avoid = () => within(screen.getByRole("group", { name: "Avoid" }));
const saveButton = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => vi.clearAllMocks());

describe("HouseholdDialog", () => {
  it("shows the saved settings with their help texts", async () => {
    renderDialog({ ...DEFAULT_HOUSEHOLD, required_properties: ["vegetarian"], min_fish_meals: 0, lunch_time: "13:30" });
    const dialog = await screen.findByRole("dialog", { name: "Household preferences" });
    expect(await within(dialog).findByLabelText("Fewest fish or seafood meals")).toHaveValue(0);
    expect(diet().getByRole("checkbox", { name: /Vegetarian/ })).toBeChecked();
    expect(diet().getByRole("checkbox", { name: /Vegan/ })).not.toBeChecked();
    expect(avoid().getAllByRole("checkbox")).toHaveLength(9);
    expect(within(dialog).getByLabelText("Lunch starts at")).toHaveValue("13:30");
    expect(within(dialog).getByLabelText("Dinner starts at")).toHaveValue("21:00");
    expect(within(dialog).getByText("Suggestions only propose recipes tagged with all of these.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Suggestions skip recipes with any of these. You can still add them by hand."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Most meals with the same main protein")).toHaveAccessibleDescription(
      "More than this in a week is flagged as a warning (1 to 14).",
    );
  });

  it("starts with Save disabled and enables it after a change", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText("Lunch starts at");
    expect(saveButton()).toBeDisabled();
    await user.click(diet().getByRole("checkbox", { name: /Gluten-free/ }));
    expect(saveButton()).toBeEnabled();
    await user.click(diet().getByRole("checkbox", { name: /Gluten-free/ }));
    expect(saveButton()).toBeDisabled();
  });

  it("disables an avoid option that is required in Diet, and un-avoids it when required", async () => {
    const user = userEvent.setup();
    renderDialog({ ...DEFAULT_HOUSEHOLD, avoided_properties: ["vegan", "spicy"] });
    await screen.findByLabelText("Lunch starts at");
    const dietVegan = diet().getByRole("checkbox", { name: /Vegan/ });
    const avoidVegan = avoid().getByRole("checkbox", { name: /Vegan/ });
    expect(avoidVegan).toBeChecked();
    await user.click(dietVegan);
    expect(avoidVegan).toBeDisabled();
    expect(avoidVegan).not.toBeChecked();
    expect(avoid().getByRole("checkbox", { name: /Spicy/ })).toBeChecked();
  });

  it("steps the targets with the buttons and stays inside the limits", async () => {
    const user = userEvent.setup();
    renderDialog();
    const fish = await screen.findByLabelText("Fewest fish or seafood meals");
    await user.click(screen.getByRole("button", { name: "Increase: Fewest fish or seafood meals" }));
    expect(fish).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: "Decrease: Fewest fish or seafood meals" }));
    await user.click(screen.getByRole("button", { name: "Decrease: Fewest fish or seafood meals" }));
    await user.click(screen.getByRole("button", { name: "Decrease: Fewest fish or seafood meals" }));
    expect(fish).toHaveValue(0);
  });

  it("flags invalid numbers and times inline and blocks saving", async () => {
    const user = userEvent.setup();
    renderDialog();
    const max = await screen.findByLabelText("Most meals with the same main protein");
    await user.clear(max);
    await user.type(max, "20");
    expect(max).toBeInvalid();
    expect(max).toHaveAccessibleDescription(/Enter a whole number from 1 to 14\./);
    expect(saveButton()).toBeDisabled();
    await user.clear(max);
    await user.type(max, "5");
    expect(max).toBeValid();
    expect(saveButton()).toBeEnabled();

    const lunch = screen.getByLabelText("Lunch starts at");
    await user.clear(lunch);
    expect(lunch).toBeInvalid();
    expect(lunch).toHaveAccessibleDescription("Enter a time such as 14:00.");
    expect(saveButton()).toBeDisabled();
  });

  it("saves the full settings object and does not close by itself", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText("Lunch starts at");
    await user.click(diet().getByRole("checkbox", { name: /Vegetarian/ }));
    await user.click(avoid().getByRole("checkbox", { name: /Spicy/ }));
    const veg = screen.getByLabelText("Fewest vegetable-forward meals");
    await user.clear(veg);
    await user.type(veg, "0");
    await user.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      ...DEFAULT_HOUSEHOLD,
      required_properties: ["vegetarian"],
      avoided_properties: ["spicy"],
      min_vegetarian_meals: 0,
    });
  });

  it("closes without saving on Cancel", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText("Lunch starts at");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("offers a retry when the settings can't be loaded", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getHouseholdSettings).mockRejectedValueOnce(new TypeError("offline"));
    renderDialog();
    vi.mocked(client.getHouseholdSettings).mockResolvedValue(DEFAULT_HOUSEHOLD);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't load your preferences");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Lunch starts at")).toBeInTheDocument();
  });
});
