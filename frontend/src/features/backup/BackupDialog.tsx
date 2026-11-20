import { useId, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { downloadBackup, restoreBackup } from "../../api/client";
import type { RestoreResult } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { Modal } from "../planner/Modal";
import { AutomaticCopies } from "./AutomaticCopies";
import {
  MAX_BACKUP_BYTES,
  checkBackupText,
  describeCheckFailure,
  describeCounts,
  describeRestoreError,
  describeSummary,
  isRetryable,
  type BackupSummary,
} from "./backupLogic";

export type Notify = (kind: "error" | "info", text: string) => void;

interface BackupDialogProps {
  onClose: () => void;
  onNotify: Notify;
}

interface Chosen {
  name: string;
  document: unknown;
  summary: BackupSummary;
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

/** Hands the blob to the browser as a file download. */
function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Download a backup of everything, or replace everything from a backup file. Restoring shows
 * what the file contains and asks for a clear confirmation first.
 */
export function BackupDialog({ onClose, onNotify }: BackupDialogProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const fileId = useId();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const restore = useMutation<RestoreResult, unknown, unknown>({
    mutationFn: (document) => restoreBackup(document),
    onSuccess: (result) => {
      // Every list, plan and shopping list may have changed.
      void queryClient.invalidateQueries();
      onNotify(
        "info",
        t("backup.restored", {
          counts: describeCounts(
            {
              recipes: result.recipes,
              meals: result.meals,
              shoppingItems: result.shopping_checks + result.shopping_extras,
            },
            t,
          ),
        }),
      );
      onClose();
    },
  });

  const download = async () => {
    setDownloading(true);
    setDownloadError(false);
    try {
      const { blob, filename } = await downloadBackup();
      saveFile(blob, filename);
      onNotify("info", t("backup.downloaded", { name: filename }));
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setChosen(null);
    setFileError(null);
    restore.reset();
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setFileError(t("backup.restoreErrors.tooLarge"));
      return;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch {
      setFileError(t("backup.fileErrors.readFailed"));
      return;
    }
    const result = checkBackupText(text);
    if (result.ok) setChosen({ name: file.name, document: result.document, summary: result.summary });
    else setFileError(describeCheckFailure(result.reason, t));
  };

  if (confirming && chosen) {
    const failed = restore.isError;
    return (
      <Modal title={t("backup.confirmTitle")} onClose={restore.isPending ? () => undefined : () => setConfirming(false)}>
        <div className="confirm-body">
          <p>
            {t("backup.confirmBody", {
              name: chosen.name,
              summary: describeSummary(chosen.summary, t, locale),
            })}
          </p>
          {failed && (
            <p className="backup-error" role="alert">
              {describeRestoreError(restore.error, t)}
              {isRetryable(restore.error) && ` ${t("backup.retryHint")}`}
            </p>
          )}
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn" disabled={restore.isPending} onClick={() => setConfirming(false)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={restore.isPending}
            onClick={() => restore.mutate(chosen.document)}
          >
            {restore.isPending
              ? t("backup.restoring")
              : failed && isRetryable(restore.error)
                ? t("backup.tryAgain")
                : t("backup.confirm")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("backup.title")} onClose={onClose} size="full">
      <div className="backup">
        <section className="backup-section" aria-labelledby={`${fileId}-download`}>
          <h3 id={`${fileId}-download`}>{t("backup.downloadHeading")}</h3>
          <p>{t("backup.downloadHelp")}</p>
          <button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void download()}>
            {downloading ? t("backup.downloading") : t("backup.download")}
          </button>
          {downloadError && (
            <p className="backup-error" role="alert">
              {t("backup.downloadFailed")}
            </p>
          )}
        </section>

        <section className="backup-section" aria-labelledby={`${fileId}-restore`}>
          <h3 id={`${fileId}-restore`}>{t("backup.restoreHeading")}</h3>
          <p>{t("backup.restoreHelp")}</p>
          <label className="backup-file" htmlFor={fileId}>
            {t("backup.chooseFile")}
          </label>
          <input
            id={fileId}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void choose(event)}
          />
          {fileError && (
            <p className="backup-error" role="alert">
              {fileError}
            </p>
          )}
          {chosen && (
            <div className="backup-chosen" role="status">
              <p>
                {t("backup.contains", {
                  name: chosen.name,
                  summary: describeSummary(chosen.summary, t, locale),
                })}
              </p>
              <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
                {t("backup.restore")}
              </button>
            </div>
          )}
        </section>

        <AutomaticCopies />
      </div>
    </Modal>
  );
}
