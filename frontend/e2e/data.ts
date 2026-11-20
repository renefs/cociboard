// The known state every test starts from: a small catalogue, no plans, default preferences.
// It is loaded through the app's own restore endpoint (see fixtures.ts).

export interface SeedRecipe {
  ref: number;
  name: string;
  meal_type: "lunch" | "dinner" | "both";
  protein: string;
  ingredients: string[];
  properties?: string[];
  prep_minutes?: number | null;
  favourite?: boolean;
  archived?: boolean;
}

export interface SeedMeal {
  week_start: string;
  day: number;
  slot: "lunch" | "dinner";
  recipe_ref?: number;
  special?: "eating_out" | "leftovers" | "free";
  note?: string;
}

// Names are unique and deliberately unlike each other so a search matches exactly one.
export const RECIPES: SeedRecipe[] = [
  { ref: 1, name: "Lentil stew", meal_type: "both", protein: "legumes", ingredients: ["200 g lentils", "1 carrot", "olive oil"], properties: ["vegetarian", "vegan", "batch_cooking"], prep_minutes: 45 },
  { ref: 2, name: "Grilled chicken", meal_type: "dinner", protein: "poultry", ingredients: ["2 chicken breasts", "1 lemon", "olive oil"], properties: ["quick", "gluten_free"], prep_minutes: 25 },
  { ref: 3, name: "Baked salmon", meal_type: "dinner", protein: "fish", ingredients: ["2 salmon fillets", "1 lemon"], properties: ["gluten_free"], prep_minutes: 30 },
  { ref: 4, name: "Veggie omelette", meal_type: "lunch", protein: "eggs", ingredients: ["4 eggs", "1 pepper"], properties: ["vegetarian", "quick"], prep_minutes: 15 },
  { ref: 5, name: "Tofu stir-fry", meal_type: "both", protein: "tofu", ingredients: ["200 g tofu", "1 courgette", "soy sauce"], properties: ["vegetarian", "vegan", "quick"], prep_minutes: 20 },
  { ref: 6, name: "Beef meatballs", meal_type: "dinner", protein: "meat", ingredients: ["400 g minced beef", "1 onion"], prep_minutes: 40 },
  { ref: 7, name: "Garlic prawns", meal_type: "both", protein: "seafood", ingredients: ["300 g prawns", "2 garlic cloves"], properties: ["quick", "gluten_free"], prep_minutes: 15 },
  { ref: 8, name: "Chickpea salad", meal_type: "lunch", protein: "legumes", ingredients: ["1 can chickpeas", "1 cucumber"], properties: ["vegetarian", "vegan", "light"], prep_minutes: 10 },
  { ref: 9, name: "Cheese pasta", meal_type: "both", protein: "dairy", ingredients: ["250 g pasta", "100 g cheese"], properties: ["vegetarian", "kid_friendly"], prep_minutes: 20 },
  { ref: 10, name: "Pork tenderloin", meal_type: "dinner", protein: "meat", ingredients: ["1 pork tenderloin", "1 onion"], prep_minutes: 50 },
  { ref: 11, name: "Tuna sandwich", meal_type: "lunch", protein: "fish", ingredients: ["1 can tuna", "2 slices bread"], prep_minutes: 5 },
  { ref: 12, name: "Vegetable curry", meal_type: "both", protein: "legumes", ingredients: ["1 can coconut milk", "1 sweet potato"], properties: ["vegetarian", "vegan", "spicy"], prep_minutes: 35 },
  { ref: 13, name: "Roast turkey", meal_type: "dinner", protein: "poultry", ingredients: ["1 turkey breast", "1 onion"], prep_minutes: 60 },
  { ref: 14, name: "Mushroom risotto", meal_type: "dinner", protein: "none", ingredients: ["200 g rice", "200 g mushrooms"], properties: ["vegetarian", "gluten_free"], prep_minutes: 40 },
];

export interface Seed {
  recipes?: SeedRecipe[];
  meals?: SeedMeal[];
  pantry?: string[];
}

/** A v6 backup document (the format `POST /api/backup/restore` accepts). */
export function backupDocument(seed: Seed = {}): Record<string, unknown> {
  return {
    format: "cociboard-backup",
    format_version: 6,
    app_version: "e2e",
    exported_at: "2026-01-01T00:00:00Z",
    recipes: (seed.recipes ?? RECIPES).map((recipe) => ({
      description: null,
      prep_minutes: null,
      properties: [],
      favourite: false,
      archived: false,
      created_at: "2026-01-01T00:00:00Z",
      ...recipe,
    })),
    meals: seed.meals ?? [],
    shopping_checks: [],
    shopping_extras: [],
    pantry: (seed.pantry ?? []).map((name) => ({ name })),
    settings: {},
  };
}
