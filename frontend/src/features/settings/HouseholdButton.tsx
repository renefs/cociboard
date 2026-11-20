import { useTranslation } from "react-i18next";

interface HouseholdButtonProps {
  onClick: () => void;
}

/** Header icon button that opens the household preferences. */
export function HouseholdButton({ onClick }: HouseholdButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="header-button header-button--icon"
      aria-haspopup="dialog"
      aria-label={t("household.button")}
      title={t("household.buttonTitle")}
      onClick={onClick}
    >
      <span aria-hidden="true">⚙️</span>
    </button>
  );
}
