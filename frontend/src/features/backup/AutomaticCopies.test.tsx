import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { BackupStatus } from "../../api/types";
import i18n from "../../i18n";
import { renderWithQuery } from "../../test/utils";
import { AutomaticCopies } from "./AutomaticCopies";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  getBackupStatus: vi.fn(),
}));

const status = (changes: Partial<BackupStatus> = {}): BackupStatus => ({
  enabled: true,
  interval_hours: 24,
  kept: 7,
  last_backup_at: "2026-11-19T10:30:00Z",
  copies: 3,
  last_error: null,
  custom_dir: false,
  ...changes,
});

beforeEach(async () => {
  vi.mocked(client.getBackupStatus).mockReset();
  await i18n.changeLanguage("en");
});

describe("AutomaticCopies", () => {
  it("shows the last copy, how many are kept and how to restore one", async () => {
    vi.mocked(client.getBackupStatus).mockResolvedValue(status());
    renderWithQuery(<AutomaticCopies />);

    expect(await screen.findByRole("heading", { name: "Automatic copies" })).toBeInTheDocument();
    expect(screen.getByText(/Last automatic copy: .*2026.*The last 7 are kept\./)).toBeInTheDocument();
    expect(screen.getByText(/stop the app, replace the database file/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the singular when only one copy is kept", async () => {
    vi.mocked(client.getBackupStatus).mockResolvedValue(status({ kept: 1 }));
    renderWithQuery(<AutomaticCopies />);
    expect(await screen.findByText(/Only the latest copy is kept/)).toBeInTheDocument();
  });

  it("says the first copy is coming when none exists yet", async () => {
    vi.mocked(client.getBackupStatus).mockResolvedValue(status({ last_backup_at: null, copies: 0 }));
    renderWithQuery(<AutomaticCopies />);
    expect(await screen.findByText("The first automatic copy will be made soon.")).toBeInTheDocument();
  });

  it("says they are off, naming the setting", async () => {
    vi.mocked(client.getBackupStatus).mockResolvedValue(status({ enabled: false, interval_hours: 0 }));
    renderWithQuery(<AutomaticCopies />);
    expect(
      await screen.findByText("Automatic copies are off (COCIBOARD_BACKUP_INTERVAL_HOURS=0)."),
    ).toBeInTheDocument();
  });

  it("warns about the last failure with a message for its code", async () => {
    vi.mocked(client.getBackupStatus).mockResolvedValue(
      status({ last_error: { at: "2026-11-19T11:00:00Z", code: "disk_full" } }),
    );
    renderWithQuery(<AutomaticCopies />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The last automatic copy failed: the disk is full.");
  });

  it("is translated", async () => {
    await i18n.changeLanguage("es");
    vi.mocked(client.getBackupStatus).mockResolvedValue(status({ last_backup_at: null, copies: 0 }));
    renderWithQuery(<AutomaticCopies />);
    expect(await screen.findByRole("heading", { name: "Copias automáticas" })).toBeInTheDocument();
    expect(screen.getByText("La primera copia automática se hará en breve.")).toBeInTheDocument();
  });

  it("renders nothing while loading or when the server cannot be reached", async () => {
    vi.mocked(client.getBackupStatus).mockRejectedValue(new TypeError("offline"));
    const { container } = renderWithQuery(<AutomaticCopies />);
    await vi.waitFor(() => expect(client.getBackupStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
