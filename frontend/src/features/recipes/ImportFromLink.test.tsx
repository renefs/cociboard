import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { ApiError } from "../../api/client";
import { makeDraft, makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { importSession } from "./importSession";
import { RecipeForm } from "./RecipeForm";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  importRecipe: vi.fn(),
}));

beforeEach(() => {
  importSession.disabled = false;
});

function renderForm(props: { importUrl?: string } = {}) {
  renderWithQuery(<RecipeForm {...props} onSaved={vi.fn()} onCancel={vi.fn()} />);
}

const linkField = () => screen.getByRole("textbox", { name: "Recipe page link" });
const importButton = () => screen.getByRole("button", { name: "Import" });
const nameField = () => screen.getByRole("textbox", { name: /^Name/ });

async function importLink(user: ReturnType<typeof userEvent.setup>, url = "https://example.com/stew") {
  await user.type(linkField(), url);
  await user.click(importButton());
}

describe("Import from a link", () => {
  it("is a url field with a url keyboard, and only on a new recipe", () => {
    renderForm();
    expect(linkField()).toHaveAttribute("type", "url");
    expect(linkField()).toHaveAttribute("inputmode", "url");
  });

  it("is not offered when editing a recipe", () => {
    renderWithQuery(<RecipeForm recipe={makeRecipe()} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Import from a link" })).not.toBeInTheDocument();
  });

  it("fills the form from the draft and says where it came from", async () => {
    vi.mocked(client.importRecipe).mockResolvedValue(
      makeDraft({ warnings: ["servings_unknown", "name_exists"] }),
    );
    const user = userEvent.setup();
    renderForm();
    await importLink(user);

    expect(client.importRecipe).toHaveBeenCalledWith("https://example.com/stew");
    await waitFor(() => expect(nameField()).toHaveValue("Lemon Chicken Traybake"));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("A simple weeknight dinner.");
    expect(screen.getByRole("textbox", { name: /Prep time/ })).toHaveValue("60");
    expect(screen.getByRole("textbox", { name: "Servings" })).toHaveValue("4");
    expect(screen.getByRole("textbox", { name: "Ingredient 1" })).toHaveValue("8 chicken thighs");
    expect(screen.getByRole("textbox", { name: "Ingredient 2" })).toHaveValue("2 lemons");
    expect(screen.getByRole("textbox", { name: "Step 1" })).toHaveValue("Heat the oven.");
    expect(screen.getByRole("textbox", { name: "Source link" })).toHaveValue("https://www.example.com/final");
    expect(
      screen.getByText(
        "Imported from example.com. Check the meal type and the main protein before saving.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("The number of servings wasn't found.")).toBeInTheDocument();
    expect(screen.getByText("A recipe with this name already exists.")).toBeInTheDocument();
  });

  it("shows a pending state while the server works", async () => {
    let finish: (draft: ReturnType<typeof makeDraft>) => void = () => undefined;
    vi.mocked(client.importRecipe).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderForm();
    await importLink(user);
    const busy = await screen.findByRole("button", { name: "Importing…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(client.importRecipe).toHaveBeenCalledTimes(1);
    finish(makeDraft());
    await waitFor(() => expect(importButton()).toHaveAttribute("aria-busy", "false"));
  });

  it("Enter in the link field imports instead of submitting the form", async () => {
    vi.mocked(client.importRecipe).mockResolvedValue(makeDraft());
    const user = userEvent.setup();
    renderForm();
    await user.type(linkField(), "https://example.com/stew{Enter}");
    await waitFor(() => expect(client.importRecipe).toHaveBeenCalledTimes(1));
    expect(client.createRecipe).not.toHaveBeenCalled();
    expect(screen.queryByText("Enter a name.")).not.toBeInTheDocument();
  });

  it("asks before replacing what was typed, and replaces on confirm", async () => {
    vi.mocked(client.importRecipe).mockResolvedValue(makeDraft());
    const user = userEvent.setup();
    renderForm();
    await user.type(nameField(), "My own stew");
    await importLink(user);

    const confirm = await screen.findByRole("group", { name: /Replace what you have typed/ });
    expect(nameField()).toHaveValue("My own stew");
    await user.click(within(confirm).getByRole("button", { name: "Replace" }));
    expect(nameField()).toHaveValue("Lemon Chicken Traybake");
    expect(screen.queryByRole("group", { name: /Replace what you have typed/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Imported from example.com/)).toBeInTheDocument();
  });

  it("keeps what was typed when asked to", async () => {
    vi.mocked(client.importRecipe).mockResolvedValue(makeDraft());
    const user = userEvent.setup();
    renderForm();
    await user.type(nameField(), "My own stew");
    await importLink(user);
    await user.click(await screen.findByRole("button", { name: "Keep what I typed" }));
    expect(nameField()).toHaveValue("My own stew");
    expect(screen.getByText("Kept what you typed. Nothing was imported.")).toBeInTheDocument();
    expect(screen.queryByText(/Imported from/)).not.toBeInTheDocument();
  });

  it.each([
    [422, { code: "blocked_address" }, "This address can't be imported."],
    [422, { code: "no_recipe_found" }, "This page doesn't contain a recipe Cociboard can read."],
    [502, { code: "fetch_failed", status: 403 }, "The website answered with error 403."],
    [504, { code: "timeout" }, "The website took too long to answer."],
    [413, { code: "too_large" }, "That page is too large to import."],
    [415, { code: "not_html" }, "That link isn't a web page."],
    [429, { code: "busy" }, "Other imports are running. Try again in a moment."],
  ])("maps %i %o to a friendly sentence", async (status, detail, message) => {
    vi.mocked(client.importRecipe).mockRejectedValue(new ApiError(status, "failed", detail));
    const user = userEvent.setup();
    renderForm();
    await importLink(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(nameField()).toHaveValue("");
  });

  it("explains a network failure", async () => {
    vi.mocked(client.importRecipe).mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderForm();
    await importLink(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach Cociboard");
  });

  it("rejects something that is not a link without calling the server", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(linkField(), "lentil stew");
    await user.click(importButton());
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a full link starting with http");
    expect(linkField()).toHaveFocus();
    expect(linkField()).toHaveAttribute("aria-invalid", "true");
    expect(client.importRecipe).not.toHaveBeenCalled();
  });

  it("hides the area for the rest of the session once the server says it is disabled", async () => {
    vi.mocked(client.importRecipe).mockRejectedValue(
      new ApiError(404, "failed", { code: "import_disabled" }),
    );
    const user = userEvent.setup();
    const first = renderWithQuery(<RecipeForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    await importLink(user);
    expect(await screen.findByText("Importing from a link is turned off on this server.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
    first.unmount();

    renderForm();
    expect(screen.queryByRole("heading", { name: "Import from a link" })).not.toBeInTheDocument();
    expect(screen.queryByText("Importing from a link is turned off on this server.")).not.toBeInTheDocument();
  });

  it("starts at once for a shared link", async () => {
    vi.mocked(client.importRecipe).mockResolvedValue(makeDraft());
    renderForm({ importUrl: "https://example.com/shared" });
    await waitFor(() => expect(nameField()).toHaveValue("Lemon Chicken Traybake"));
    expect(client.importRecipe).toHaveBeenCalledWith("https://example.com/shared");
    expect(client.importRecipe).toHaveBeenCalledTimes(1);
    expect(linkField()).toHaveValue("https://example.com/shared");
  });

  it("clears earlier validation errors after filling the form", async () => {
    vi.mocked(client.importRecipe).mockResolvedValue(makeDraft());
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Create recipe" }));
    expect(screen.getByText("Enter a name.")).toBeInTheDocument();
    await importLink(user);
    await waitFor(() => expect(screen.queryByText("Enter a name.")).not.toBeInTheDocument());
    fireEvent.blur(nameField());
  });
});
