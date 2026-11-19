import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { renderWithQuery } from "../../test/utils";
import { BackupDialog } from "./BackupDialog";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  downloadBackup: vi.fn(),
  restoreBackup: vi.fn(),
}));

const onClose = vi.fn();
const onNotify = vi.fn();

const backup = {
  format: "cociboard-backup",
  format_version: 1,
  app_version: "0.11.0",
  exported_at: "2026-11-19T10:00:00+00:00",
  recipes: [{ ref: 1 }, { ref: 2 }],
  meals: [{ recipe_ref: 1 }],
  shopping_checks: [],
  shopping_extras: [],
};

const fileOf = (content: string, name = "backup.json") =>
  new File([content], name, { type: "application/json" });

function renderDialog() {
  return renderWithQuery(<BackupDialog onClose={onClose} onNotify={onNotify} />);
}

async function choose(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(screen.getByLabelText("Backup file"), file);
}

beforeEach(() => {
  onClose.mockReset();
  onNotify.mockReset();
  vi.mocked(client.downloadBackup).mockReset();
  vi.mocked(client.restoreBackup).mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("BackupDialog download", () => {
  it("fetches the backup and saves it under the server file name", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["{}"]);
    vi.mocked(client.downloadBackup).mockResolvedValue({ blob, filename: "cociboard-backup-2026-11-19.json" });
    const createUrl = vi.fn(() => "blob:fake");
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(`${this.download}|${this.href}`);
    });

    renderDialog();
    expect(screen.getByText(/Saves one file with all your recipes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download backup" }));

    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("info", expect.stringContaining("cociboard-backup-2026-11-19.json")));
    expect(client.downloadBackup).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual(["cociboard-backup-2026-11-19.json|blob:fake"]);
  });

  it("shows an error when the download fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.downloadBackup).mockRejectedValue(new TypeError("offline"));
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't download the backup");
    expect(screen.getByRole("button", { name: "Download backup" })).toBeEnabled();
  });
});

describe("BackupDialog restore", () => {
  it("summarises the file, asks for confirmation and then posts it", async () => {
    const user = userEvent.setup();
    vi.mocked(client.restoreBackup).mockResolvedValue({ recipes: 2, meals: 1, shopping_checks: 0, shopping_extras: 0 });
    const { queryClient } = renderDialog();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await choose(user, fileOf(JSON.stringify(backup)));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("backup.json contains 2 recipes, 1 planned meal, 0 shopping items, exported on 19 November 2026.");
    expect(client.restoreBackup).not.toHaveBeenCalled();

    await user.click(within(status).getByRole("button", { name: "Restore…" }));
    const confirm = await screen.findByRole("dialog", { name: "Replace all your data?" });
    expect(confirm).toHaveTextContent("This replaces all your recipes, plans and shopping lists");
    expect(confirm).toHaveTextContent("A copy of the current data is kept on the server.");
    expect(client.restoreBackup).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Replace everything" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.restoreBackup).toHaveBeenCalledWith(backup);
    expect(onNotify).toHaveBeenCalledWith("info", "Backup restored: 2 recipes, 1 planned meal, 0 shopping items.");
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("can go back from the confirmation without sending anything", async () => {
    const user = userEvent.setup();
    renderDialog();
    await choose(user, fileOf(JSON.stringify(backup)));
    await user.click(await screen.findByRole("button", { name: "Restore…" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Replace all your data?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Backup" })).toBeInTheDocument();
    expect(client.restoreBackup).not.toHaveBeenCalled();
  });

  it("rejects files that are not backups before anything is sent", async () => {
    const user = userEvent.setup();
    renderDialog();
    await choose(user, fileOf("not json"));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't JSON");
    await choose(user, fileOf(JSON.stringify({ format: "other" })));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not a Cociboard backup"));
    expect(screen.queryByRole("button", { name: "Restore…" })).not.toBeInTheDocument();
  });

  it("shows a translated error when the server refuses the file", async () => {
    const user = userEvent.setup();
    vi.mocked(client.restoreBackup).mockRejectedValue(
      new client.ApiError(422, "x", { code: "duplicate_recipe_name", message: "m", params: { name: "paella" } }),
    );
    renderDialog();
    await choose(user, fileOf(JSON.stringify(backup)));
    await user.click(await screen.findByRole("button", { name: "Restore…" }));
    await user.click(await screen.findByRole("button", { name: "Replace everything" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("two recipes named “paella”");
    expect(onClose).not.toHaveBeenCalled();
    // A rejected file is not retried as is.
    expect(screen.getByRole("button", { name: "Replace everything" })).toBeEnabled();
  });

  it("offers a retry after a network error", async () => {
    const user = userEvent.setup();
    vi.mocked(client.restoreBackup).mockRejectedValueOnce(new TypeError("offline"));
    vi.mocked(client.restoreBackup).mockResolvedValueOnce({ recipes: 2, meals: 1, shopping_checks: 0, shopping_extras: 0 });
    renderDialog();
    await choose(user, fileOf(JSON.stringify(backup)));
    await user.click(await screen.findByRole("button", { name: "Restore…" }));
    await user.click(await screen.findByRole("button", { name: "Replace everything" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Your data was not changed.");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.restoreBackup).toHaveBeenCalledTimes(2);
  });
});
