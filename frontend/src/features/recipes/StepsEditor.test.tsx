import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { StepsEditor } from "./StepsEditor";

function Harness({ initial }: { initial: string[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <>
      <StepsEditor rows={rows} onChange={setRows} />
      <div data-testid="rows">{JSON.stringify(rows)}</div>
    </>
  );
}

const rows = () => JSON.parse(screen.getByTestId("rows").textContent ?? "[]") as string[];
const step = (n: number) => screen.getByRole("textbox", { name: `Step ${n}` });

describe("StepsEditor", () => {
  it("starts empty with only Add step, and adds a focused step", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add step/ }));
    expect(step(1)).toHaveFocus();
    await user.type(step(1), "Chop");
    await user.click(screen.getByRole("button", { name: /Add step/ }));
    expect(step(2)).toHaveFocus();
    expect(rows()).toEqual(["Chop", ""]);
  });

  it("names the step number on every button", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole("button", { name: `Move step ${n} up` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Move step ${n} down` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Remove step ${n}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Move step 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move step 3 down" })).toBeDisabled();
  });

  it("moves a step up and down, keeping focus on the moved step's button and announcing it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["a", "b", "c"]} />);
    await user.click(screen.getByRole("button", { name: "Move step 2 up" }));
    expect(rows()).toEqual(["b", "a", "c"]);
    expect(screen.getByRole("button", { name: "Move step 1 up" })).toBeDisabled();
    // Reached the top: the focus passes to the Move down button of the same step.
    expect(screen.getByRole("button", { name: "Move step 1 down" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Step moved to position 1 of 3.");

    await user.click(screen.getByRole("button", { name: "Move step 1 down" }));
    expect(rows()).toEqual(["a", "b", "c"]);
    expect(screen.getByRole("button", { name: "Move step 2 down" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Move step 2 down" }));
    expect(rows()).toEqual(["a", "c", "b"]);
    expect(screen.getByRole("button", { name: "Move step 3 up" })).toHaveFocus();
  });

  it("removes a step and focuses its neighbour, or Add step when none is left", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["a", "b", "c"]} />);
    await user.click(screen.getByRole("button", { name: "Remove step 2" }));
    expect(rows()).toEqual(["a", "c"]);
    expect(step(2)).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 removed.");
    await user.click(screen.getByRole("button", { name: "Remove step 2" }));
    expect(step(1)).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(rows()).toEqual([]);
    expect(screen.getByRole("button", { name: /Add step/ })).toHaveFocus();
  });

  it("stops adding at 50 steps", () => {
    render(<Harness initial={Array(50).fill("x")} />);
    expect(screen.getByRole("button", { name: /Add step/ })).toBeDisabled();
  });
});
