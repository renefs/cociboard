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

export const MEAL_TYPE_META: Record<MealType, Meta> = {
  lunch: { icon: "☀️", labelKey: "meta.mealType.lunch", color: "#8a5a0b" },
  dinner: { icon: "🌙", labelKey: "meta.mealType.dinner", color: "#4c51bf" },
  both: { icon: "🍽️", labelKey: "meta.mealType.both", color: "#276749" },
};

export const PROTEIN_META: Record<Protein, Meta> = {
  meat: { icon: "🥩", labelKey: "meta.protein.meat", color: "#9b2c2c" },
  poultry: { icon: "🍗", labelKey: "meta.protein.poultry", color: "#8a5a0b" },
  fish: { icon: "🐟", labelKey: "meta.protein.fish", color: "#2b6cb0" },
  seafood: { icon: "🦐", labelKey: "meta.protein.seafood", color: "#a8481a" },
  eggs: { icon: "🥚", labelKey: "meta.protein.eggs", color: "#975a16" },
  legumes: { icon: "🫘", labelKey: "meta.protein.legumes", color: "#744210" },
  dairy: { icon: "🧀", labelKey: "meta.protein.dairy", color: "#8a5a0b" },
  tofu: { icon: "🥡", labelKey: "meta.protein.tofu", color: "#4a5568" },
  none: { icon: "🥬", labelKey: "meta.protein.none", color: "#276749" },
};

export const PROPERTY_META: Record<RecipeProperty, Meta> = {
  vegetarian: { icon: "🥕", labelKey: "meta.property.vegetarian", color: "#276749" },
  vegan: { icon: "🌱", labelKey: "meta.property.vegan", color: "#276749" },
  gluten_free: { icon: "🌾", labelKey: "meta.property.gluten_free", color: "#8a5a0b" },
  dairy_free: { icon: "🥛", labelKey: "meta.property.dairy_free", color: "#2b6cb0" },
  quick: { icon: "⚡", labelKey: "meta.property.quick", color: "#8a6a00" },
  spicy: { icon: "🌶️", labelKey: "meta.property.spicy", color: "#c53030" },
  light: { icon: "🪶", labelKey: "meta.property.light", color: "#06758b" },
  kid_friendly: { icon: "🧒", labelKey: "meta.property.kid_friendly", color: "#b83280" },
  batch_cooking: { icon: "🍲", labelKey: "meta.property.batch_cooking", color: "#6b46c1" },
};
