import { useTranslation } from "react-i18next";

interface BackupButtonProps {
  onClick: () => void;
}

/** Header button that opens the backup dialog. */
export function BackupButton({ onClick }: BackupButtonProps) {
  const { t } = useTranslation();
  return (
    <button type="button" className="header-button" aria-haspopup="dialog" title={t("backup.buttonTitle")} onClick={onClick}>
      <span aria-hidden="true">💾</span> <span className="header-button-label">{t("backup.button")}</span>
    </button>
  );
}
