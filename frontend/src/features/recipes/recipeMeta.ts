import type { MealType, Protein, RecipeProperty } from "../../api/types";

export interface Meta {
  /** Emoji shown at a glance. Always rendered with an accessible label. */
  icon: string;
  label: string;
  /** Accent colour used as badge text and border; at least 4.5:1 on the app backgrounds. */
  color: string;
}

export const MEAL_TYPE_META: Record<MealType, Meta> = {
  lunch: { icon: "☀️", label: "Lunch", color: "#8a5a0b" },
  dinner: { icon: "🌙", label: "Dinner", color: "#4c51bf" },
  both: { icon: "🍽️", label: "Lunch or dinner", color: "#276749" },
};

export const PROTEIN_META: Record<Protein, Meta> = {
  meat: { icon: "🥩", label: "Meat", color: "#9b2c2c" },
  poultry: { icon: "🍗", label: "Poultry", color: "#8a5a0b" },
  fish: { icon: "🐟", label: "Fish", color: "#2b6cb0" },
  seafood: { icon: "🦐", label: "Seafood", color: "#a8481a" },
  eggs: { icon: "🥚", label: "Eggs", color: "#975a16" },
  legumes: { icon: "🫘", label: "Legumes", color: "#744210" },
  dairy: { icon: "🧀", label: "Dairy", color: "#8a5a0b" },
  tofu: { icon: "🥡", label: "Tofu", color: "#4a5568" },
  none: { icon: "🥬", label: "No main protein", color: "#276749" },
};

export const PROPERTY_META: Record<RecipeProperty, Meta> = {
  vegetarian: { icon: "🥕", label: "Vegetarian", color: "#276749" },
  vegan: { icon: "🌱", label: "Vegan", color: "#276749" },
  gluten_free: { icon: "🌾", label: "Gluten-free", color: "#8a5a0b" },
  dairy_free: { icon: "🥛", label: "Dairy-free", color: "#2b6cb0" },
  quick: { icon: "⚡", label: "Quick (30 min or less)", color: "#8a6a00" },
  spicy: { icon: "🌶️", label: "Spicy", color: "#c53030" },
  light: { icon: "🪶", label: "Light", color: "#06758b" },
  kid_friendly: { icon: "🧒", label: "Kid-friendly", color: "#b83280" },
  batch_cooking: { icon: "🍲", label: "Batch cooking", color: "#6b46c1" },
};
