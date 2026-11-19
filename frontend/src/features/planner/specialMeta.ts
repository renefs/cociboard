import type { SpecialMeal } from "../../api/types";

export interface SpecialMetaEntry {
  /** Emoji shown at a glance. Always rendered with a visible or accessible label. */
  icon: string;
  /** Catalogue key of the display name (see `i18n/locales`), translated where it is shown. */
  labelKey: `meta.special.${SpecialMeal}`;
}

/** The single place that maps a special meal to its icon and label. */
export const SPECIAL_META: Record<SpecialMeal, SpecialMetaEntry> = {
  eating_out: { icon: "🍴", labelKey: "meta.special.eating_out" },
  leftovers: { icon: "♻️", labelKey: "meta.special.leftovers" },
  free: { icon: "🌴", labelKey: "meta.special.free" },
};
