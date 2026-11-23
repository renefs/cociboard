import { BookOpen, CalendarDays, ShoppingCart, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MOBILE_VIEWS, type MobileView } from "./mobileView";

/** Line icon shown above each label; decorative, the visible label names the button. */
const TAB_ICON: Record<MobileView, LucideIcon> = {
  today: UtensilsCrossed,
  week: CalendarDays,
  recipes: BookOpen,
  shopping: ShoppingCart,
};

interface MobileTabBarProps {
  view: MobileView;
  onChange: (view: MobileView) => void;
}

/** The fixed bottom navigation of the phone layout: one button per view. */
export function MobileTabBar({ view, onChange }: MobileTabBarProps) {
  const { t } = useTranslation();
  return (
    <nav className="tab-bar" aria-label={t("mobile.nav")}>
      {MOBILE_VIEWS.map((id) => {
        const Icon = TAB_ICON[id];
        return (
          <button
            key={id}
            type="button"
            className={id === view ? "tab-bar-button is-active" : "tab-bar-button"}
            aria-current={id === view ? "page" : undefined}
            onClick={() => onChange(id)}
          >
            <span className="tab-bar-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <span className="tab-bar-label">{t(`mobile.tabs.${id}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}
