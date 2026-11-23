import type { CSSProperties } from "react";
import type { MealType, Protein, RecipeProperty } from "../../api/types";

export type MetaLabelKey =
  | `meta.mealType.${MealType}`
  | `meta.protein.${Protein}`
  | `meta.property.${RecipeProperty}`;

export interface Meta {
  /** Emoji shown at a glance. Always rendered with an accessible label. */
  icon: string;
  /** Catalogue key of the display name (see `i18n/locales`), translated where it is shown. */
  labelKey: MetaLabelKey;
  /** Accent colour used as badge text and border; at least 4.5:1 on the app backgrounds. */
  color: string;
}

/** Meal-type badges are the only accent colours rendered, so they also carry a dark-theme colour. */
export interface MealTypeMeta extends Meta {
  /** Lighter variant of `color` for the dark theme; at least 4.5:1 on the dark surfaces. */
  darkColor: string;
}

/** Same shape as a meal type: a colour for each theme. */
export type ProteinMeta = MealTypeMeta;

export const MEAL_TYPE_META: Record<MealType, MealTypeMeta> = {
  lunch: { icon: "☀️", labelKey: "meta.mealType.lunch", color: "#8a5a0b", darkColor: "#e5b45c" },
  dinner: { icon: "🌙", labelKey: "meta.mealType.dinner", color: "#4c51bf", darkColor: "#a5b4fc" },
  both: { icon: "🍽️", labelKey: "meta.mealType.both", color: "#276749", darkColor: "#8fd19a" },
};

/**
 * Proteins also drive the dots and the stacked bar of the planner, so they carry a dark-theme
 * colour too (non-text: at least 3:1 on the card surfaces in both themes).
 */
export const PROTEIN_META: Record<Protein, ProteinMeta> = {
  meat: { icon: "🥩", labelKey: "meta.protein.meat", color: "#9b2c2c", darkColor: "#f28b82" },
  poultry: { icon: "🍗", labelKey: "meta.protein.poultry", color: "#8a5a0b", darkColor: "#e5b45c" },
  fish: { icon: "🐟", labelKey: "meta.protein.fish", color: "#2b6cb0", darkColor: "#7fb2f0" },
  seafood: { icon: "🦐", labelKey: "meta.protein.seafood", color: "#a8481a", darkColor: "#f4a06b" },
  eggs: { icon: "🥚", labelKey: "meta.protein.eggs", color: "#975a16", darkColor: "#f2d66b" },
  legumes: { icon: "🫘", labelKey: "meta.protein.legumes", color: "#744210", darkColor: "#c19a6b" },
  dairy: { icon: "🧀", labelKey: "meta.protein.dairy", color: "#8a5a0b", darkColor: "#ece3b4" },
  tofu: { icon: "🥡", labelKey: "meta.protein.tofu", color: "#4a5568", darkColor: "#a9b4c6" },
  none: { icon: "🥬", labelKey: "meta.protein.none", color: "#276749", darkColor: "#8fd19a" },
};

export const PROPERTY_META: Record<RecipeProperty, Meta> = {
  vegetarian: { icon: "🥕", labelKey: "meta.property.vegetarian", color: "#276749" },
  vegan: { icon: "🌱", labelKey: "meta.property.vegan", color: "#276749" },
  gluten_free: { icon: "🌾", labelKey: "meta.property.gluten_free", color: "#8a5a0b" },
  dairy_free: { icon: "🥛", labelKey: "meta.property.dairy_free", color: "#2b6cb0" },
  quick: { icon: "⚡", labelKey: "meta.property.quick", color: "#7d5f00" },
  spicy: { icon: "🌶️", labelKey: "meta.property.spicy", color: "#c53030" },
  light: { icon: "🪶", labelKey: "meta.property.light", color: "#06758b" },
  kid_friendly: { icon: "🧒", labelKey: "meta.property.kid_friendly", color: "#b83280" },
  batch_cooking: { icon: "🍲", labelKey: "meta.property.batch_cooking", color: "#6b46c1" },
};

/** Servings indicator on recipe cards; always rendered with an accessible "Serves N" label. */
export const SERVINGS_ICON = "👥";

/** Inline custom properties for a meal-type badge; the stylesheet picks the colour per theme. */
export function mealTypeBadgeStyle(meta: MealTypeMeta): CSSProperties {
  return { "--badge-color": meta.color, "--badge-color-dark": meta.darkColor } as CSSProperties;
}

/** Inline custom properties for a protein dot or bar segment; the stylesheet picks the colour per theme. */
export function proteinDotStyle(meta: ProteinMeta): CSSProperties {
  return { "--protein-color": meta.color, "--protein-color-dark": meta.darkColor } as CSSProperties;
}
