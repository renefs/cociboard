import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getBackupStatus } from "../../api/client";
import { useLocale } from "../../i18n/useLocale";
import { formatDateTime } from "../planner/weekMath";
import { describeAutoBackupError } from "./backupLogic";

/**
 * Status of the server's automatic database copies. They are made by the server on its own
 * schedule; this only reports them (and the last failure) and points at how to use a copy.
 * Renders nothing until the status is known, and nothing when the server cannot be reached.
 */
export function AutomaticCopies() {
  const { t } = useTranslation();
  const locale = useLocale();
  const headingId = useId();
  const { data: status } = useQuery({
    queryKey: ["backup", "status"],
    queryFn: ({ signal }) => getBackupStatus(signal),
  });
  if (!status) return null;

  return (
    <section className="backup-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("backup.autoHeading")}</h3>
      {!status.enabled ? (
        <p>{t("backup.autoOff")}</p>
      ) : status.last_backup_at ? (
        <p>
          {t("backup.autoLast", {
            count: status.kept,
            date: formatDateTime(status.last_backup_at, locale),
          })}
        </p>
      ) : (
        <p>{t("backup.autoNone")}</p>
      )}
      {status.enabled && status.last_error && (
        <p className="backup-error" role="alert">
          {describeAutoBackupError(status.last_error.code, t)}
        </p>
      )}
      <p className="backup-note">{t("backup.autoRestoreHelp")}</p>
    </section>
  );
}
