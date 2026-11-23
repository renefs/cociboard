import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/utils";
import { SettingsMenu } from "./SettingsMenu";

function setup(canLogout = false) {
  const handlers = { onOpenHousehold: vi.fn(), onOpenBackup: vi.fn(), onError: vi.fn() };
  const view = renderWithQuery(
    <>
      <SettingsMenu canLogout={canLogout} {...handlers} />
      <button type="button">outside</button>
    </>,
  );
  return { ...handlers, ...view, user: userEvent.setup() };
}

const trigger = () => screen.getByRole("button", { name: "Settings" });

describe("SettingsMenu", () => {
  it("opens and closes with aria-expanded and aria-controls", async () => {
    const { user } = setup();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(trigger().getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    await user.click(trigger());
    expect(screen.queryByRole("button", { name: "Backup" })).not.toBeInTheDocument();
  });

  it("moves focus into the panel; Escape closes it and focuses the button again", async () => {
    const { user } = setup();
    await user.click(trigger());
    expect(screen.getByRole("button", { name: "Household preferences" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Backup" })).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes on a click outside", async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("button", { name: "Backup" })).not.toBeInTheDocument();
  });

  it("opens the household preferences and closes the panel", async () => {
    const { user, onOpenHousehold } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Household preferences" }));
    expect(onOpenHousehold).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Backup" })).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("opens the backup dialog and closes the panel", async () => {
    const { user, onOpenBackup } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Backup" }));
    expect(onOpenBackup).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "Language" })).not.toBeInTheDocument();
  });

  it("has the language group, and Log out only when a password is set", async () => {
    const first = setup(false);
    await first.user.click(trigger());
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log out/ })).not.toBeInTheDocument();
    first.unmount();

    const second = setup(true);
    await second.user.click(trigger());
    expect(screen.getByRole("button", { name: /Log out/ })).toBeInTheDocument();
  });
});
