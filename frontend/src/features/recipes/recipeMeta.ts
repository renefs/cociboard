import type { MealType, Protein, RecipeProperty } from "../../api/types";

export interface Meta {
  /** Emoji shown at a glance. Always rendered with an accessible label. */
  icon: string;
  label: string;
  /** Accent colour (CSS colour) used for badge borders and tints. */
  color: string;
}

export const MEAL_TYPE_META: Record<MealType, Meta> = {
  lunch: { icon: "☀️", label: "Lunch", color: "#b7791f" },
  dinner: { icon: "🌙", label: "Dinner", color: "#4c51bf" },
  both: { icon: "🍽️", label: "Lunch or dinner", color: "#2f855a" },
};

export const PROTEIN_META: Record<Protein, Meta> = {
  meat: { icon: "🥩", label: "Meat", color: "#9b2c2c" },
  poultry: { icon: "🍗", label: "Poultry", color: "#b7791f" },
  fish: { icon: "🐟", label: "Fish", color: "#2b6cb0" },
  seafood: { icon: "🦐", label: "Seafood", color: "#c05621" },
  eggs: { icon: "🥚", label: "Eggs", color: "#975a16" },
  legumes: { icon: "🫘", label: "Legumes", color: "#744210" },
  dairy: { icon: "🧀", label: "Dairy", color: "#b7791f" },
  tofu: { icon: "🥡", label: "Tofu", color: "#4a5568" },
  none: { icon: "🥬", label: "No main protein", color: "#2f855a" },
};

export const PROPERTY_META: Record<RecipeProperty, Meta> = {
  vegetarian: { icon: "🥕", label: "Vegetarian", color: "#2f855a" },
  vegan: { icon: "🌱", label: "Vegan", color: "#276749" },
  gluten_free: { icon: "🌾", label: "Gluten-free", color: "#b7791f" },
  dairy_free: { icon: "🥛", label: "Dairy-free", color: "#2b6cb0" },
  quick: { icon: "⚡", label: "Quick (30 min or less)", color: "#d69e2e" },
  spicy: { icon: "🌶️", label: "Spicy", color: "#c53030" },
  light: { icon: "🪶", label: "Light", color: "#0987a0" },
  kid_friendly: { icon: "🧒", label: "Kid-friendly", color: "#d53f8c" },
  batch_cooking: { icon: "🍲", label: "Batch cooking", color: "#805ad5" },
};
