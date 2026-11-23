import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";
import { WeekActionsMenu } from "./WeekActionsMenu";

function setup(props: Partial<React.ComponentProps<typeof WeekActionsMenu>> = {}) {
  const onCopyPrevious = vi.fn();
  const onClear = vi.fn();
  render(
    <>
      <WeekActionsMenu copyDisabled={false} clearDisabled={false} onCopyPrevious={onCopyPrevious} onClear={onClear} {...props} />
      <button type="button">outside</button>
    </>,
  );
  return { onCopyPrevious, onClear, user: userEvent.setup() };
}

const trigger = () => screen.getByRole("button", { name: "More week actions" });

describe("WeekActionsMenu", () => {
  it("opens and closes with aria-expanded and aria-controls", async () => {
    const { user } = setup();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Other week actions" })).not.toBeInTheDocument();
    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(trigger().getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    await user.click(trigger());
    expect(screen.queryByRole("group", { name: "Other week actions" })).not.toBeInTheDocument();
  });

  it("lists copy last week and clear week, and puts the focus on the first one", async () => {
    const { user } = setup();
    await user.click(trigger());
    const panel = screen.getByRole("group", { name: "Other week actions" });
    expect(panel.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Copy last week" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Clear week" })).toBeInTheDocument();
  });

  it("closes on Escape and gives the focus back to the button", async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Other week actions" })).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes on a click outside", async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("group", { name: "Other week actions" })).not.toBeInTheDocument();
  });

  it("runs an action, closes the panel and returns the focus to the button", async () => {
    const { user, onCopyPrevious, onClear } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Copy last week" }));
    expect(onCopyPrevious).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "Other week actions" })).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();

    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Clear week" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("disables each item on its own rule, and focuses the first one that is enabled", async () => {
    const { user, onClear } = setup({ copyDisabled: true });
    await user.click(trigger());
    expect(screen.getByRole("button", { name: "Copy last week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear week" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Clear week" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Clear week" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("keeps both items disabled when there is nothing to do", async () => {
    const { user, onCopyPrevious, onClear } = setup({ copyDisabled: true, clearDisabled: true });
    await user.click(trigger());
    expect(screen.getByRole("button", { name: "Copy last week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear week" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Clear week" }));
    expect(onCopyPrevious).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("disables the button while the week loads", () => {
    setup({ disabled: true });
    expect(trigger()).toBeDisabled();
  });
});
