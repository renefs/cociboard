"""Idempotent seed data: a varied, Mediterranean/Spanish-friendly recipe set.

Run on startup when the database is empty (``COCIBOARD_SEED_ON_STARTUP``) or manually
with ``python -m cociboard.seed`` / ``make seed``.
"""

from sqlmodel import Session, select

from cociboard import repository
from cociboard.db import get_engine, init_db
from cociboard.domain import MealType, Protein, RecipeProperty
from cociboard.models import Recipe
from cociboard.schemas import RecipeCreate

L, D, B = MealType.lunch, MealType.dinner, MealType.both
P = RecipeProperty


def _r(
    name: str,
    meal_type: MealType,
    protein: Protein,
    prep: int,
    ingredients: list[str],
    properties: list[RecipeProperty],
    description: str,
) -> RecipeCreate:
    return RecipeCreate(
        name=name,
        description=description,
        meal_type=meal_type,
        protein=protein,
        prep_minutes=prep,
        ingredients=ingredients,
        properties=properties,
    )


SEED_RECIPES: list[RecipeCreate] = [
    # Lunch only (10)
    _r(
        "Lentejas estofadas",
        L,
        Protein.legumes,
        60,
        [
            "Lentejas pardinas",
            "Chorizo",
            "Zanahoria",
            "Cebolla",
            "Pimiento verde",
            "Ajo",
            "Pimentón dulce",
            "Laurel",
            "Aceite de oliva",
        ],
        [P.gluten_free, P.dairy_free, P.batch_cooking, P.kid_friendly],
        "Classic Spanish lentil stew with chorizo and vegetables.",
    ),
    _r(
        "Paella de marisco",
        L,
        Protein.seafood,
        60,
        [
            "Arroz bomba",
            "Gambas",
            "Mejillones",
            "Calamar",
            "Tomate rallado",
            "Pimiento rojo",
            "Caldo de pescado",
            "Azafrán",
            "Ajo",
            "Aceite de oliva",
        ],
        [P.gluten_free, P.dairy_free],
        "Rice cooked in fish stock with prawns, mussels and squid.",
    ),
    _r(
        "Cocido madrileño",
        L,
        Protein.meat,
        150,
        [
            "Garbanzos",
            "Morcillo de ternera",
            "Chorizo",
            "Tocino",
            "Pollo",
            "Patata",
            "Zanahoria",
            "Repollo",
            "Fideos",
        ],
        [P.dairy_free, P.batch_cooking],
        "Slow-cooked chickpea and meat stew, served in several courses.",
    ),
    _r(
        "Arroz con pollo",
        L,
        Protein.poultry,
        45,
        [
            "Arroz",
            "Muslos de pollo",
            "Pimiento rojo",
            "Guisantes",
            "Cebolla",
            "Ajo",
            "Caldo de pollo",
            "Aceite de oliva",
        ],
        [P.gluten_free, P.dairy_free, P.kid_friendly],
        "One-pot rice with chicken and peas.",
    ),
    _r(
        "Macarrones con tomate y atún",
        L,
        Protein.fish,
        25,
        ["Macarrones", "Tomate frito", "Atún en lata", "Cebolla", "Aceite de oliva"],
        [P.quick, P.dairy_free, P.kid_friendly],
        "Weekday pasta with tomato sauce and tinned tuna.",
    ),
    _r(
        "Garbanzos con espinacas",
        L,
        Protein.legumes,
        40,
        [
            "Garbanzos cocidos",
            "Espinacas",
            "Ajo",
            "Comino",
            "Pimentón dulce",
            "Pan frito",
            "Aceite de oliva",
            "Vinagre",
        ],
        [P.vegan, P.vegetarian, P.dairy_free, P.batch_cooking],
        "Andalusian chickpeas and spinach with cumin.",
    ),
    _r(
        "Bacalao a la vizcaína",
        L,
        Protein.fish,
        50,
        [
            "Bacalao desalado",
            "Cebolla",
            "Pimiento choricero",
            "Pimiento verde",
            "Ajo",
            "Tomate triturado",
            "Aceite de oliva",
        ],
        [P.dairy_free],
        "Salt cod in a Basque red pepper sauce.",
    ),
    _r(
        "Albóndigas en salsa con arroz",
        L,
        Protein.meat,
        55,
        [
            "Carne picada mixta",
            "Huevo",
            "Pan rallado",
            "Leche",
            "Perejil",
            "Cebolla",
            "Tomate triturado",
            "Zanahoria",
            "Arroz",
        ],
        [P.kid_friendly, P.batch_cooking],
        "Meatballs in tomato sauce served with white rice.",
    ),
    _r(
        "Lasaña",
        L,
        Protein.meat,
        75,
        [
            "Placas de lasaña",
            "Carne picada mixta",
            "Tomate triturado",
            "Cebolla",
            "Zanahoria",
            "Ajo",
            "Leche",
            "Mantequilla",
            "Harina",
            "Nuez moscada",
            "Queso rallado",
            "Aceite de oliva",
        ],
        [P.kid_friendly, P.batch_cooking],
        "Oven-baked pasta layers with meat sauce, béchamel and cheese.",
    ),
    _r(
        "Pasta con tomate y bonito",
        L,
        Protein.fish,
        25,
        ["Pasta corta", "Tomate frito", "Bonito en aceite", "Cebolla", "Ajo", "Aceite de oliva"],
        [P.quick, P.dairy_free, P.kid_friendly],
        "Short pasta with tomato sauce and tinned bonito.",
    ),
    # Dinner only (10)
    _r(
        "Tortilla de patatas",
        D,
        Protein.eggs,
        40,
        ["Huevos", "Patatas", "Cebolla", "Aceite de oliva", "Sal"],
        [P.vegetarian, P.gluten_free, P.dairy_free, P.kid_friendly],
        "Spanish potato omelette, with onion.",
    ),
    _r(
        "Salmón al horno con verduras",
        D,
        Protein.fish,
        30,
        [
            "Lomos de salmón",
            "Calabacín",
            "Pimiento rojo",
            "Cebolla",
            "Limón",
            "Eneldo",
            "Aceite de oliva",
        ],
        [P.gluten_free, P.dairy_free, P.light],
        "Baked salmon fillets over roasted vegetables.",
    ),
    _r(
        "Crema de calabacín",
        D,
        Protein.dairy,
        30,
        ["Calabacín", "Patata", "Puerro", "Quesitos", "Caldo de verduras", "Aceite de oliva"],
        [P.vegetarian, P.gluten_free, P.light, P.kid_friendly],
        "Smooth zucchini soup with cheese portions.",
    ),
    _r(
        "Revuelto de gambas y ajetes",
        D,
        Protein.seafood,
        15,
        ["Gambas peladas", "Ajetes tiernos", "Huevos", "Aceite de oliva", "Sal"],
        [P.quick, P.gluten_free, P.dairy_free],
        "Soft scrambled eggs with prawns and young garlic.",
    ),
    _r(
        "Pechuga a la plancha con ensalada",
        D,
        Protein.poultry,
        20,
        ["Pechuga de pollo", "Lechuga", "Tomate", "Pepino", "Limón", "Aceite de oliva"],
        [P.quick, P.light, P.gluten_free, P.dairy_free],
        "Grilled chicken breast with a fresh side salad.",
    ),
    _r(
        "Pisto con huevo frito",
        D,
        Protein.eggs,
        40,
        [
            "Tomate",
            "Calabacín",
            "Pimiento rojo",
            "Pimiento verde",
            "Cebolla",
            "Huevos",
            "Aceite de oliva",
        ],
        [P.vegetarian, P.gluten_free, P.dairy_free],
        "Manchego vegetable stew topped with a fried egg.",
    ),
    _r(
        "Hamburguesa",
        D,
        Protein.meat,
        20,
        [
            "Carne picada de ternera",
            "Pan de hamburguesa",
            "Queso en lonchas",
            "Lechuga",
            "Tomate",
            "Cebolla",
            "Aceite de oliva",
        ],
        [P.quick, P.kid_friendly],
        "Grilled beef burger in a bun with cheese, lettuce and tomato.",
    ),
    _r(
        "Puré de calabaza y zanahoria",
        D,
        Protein.none,
        35,
        [
            "Calabaza",
            "Zanahoria",
            "Patata",
            "Cebolla",
            "Caldo de verduras",
            "Aceite de oliva",
            "Sal",
        ],
        [
            P.vegan,
            P.vegetarian,
            P.gluten_free,
            P.dairy_free,
            P.light,
            P.kid_friendly,
            P.batch_cooking,
        ],
        "Smooth pumpkin and carrot purée that keeps well.",
    ),
    _r(
        "Tortilla francesa",
        D,
        Protein.eggs,
        10,
        ["Huevos", "Aceite de oliva", "Sal"],
        [P.vegetarian, P.gluten_free, P.dairy_free, P.quick, P.light, P.kid_friendly],
        "Plain folded omelette, ready in minutes.",
    ),
    _r(
        "Tosta de aguacate",
        D,
        Protein.none,
        10,
        ["Pan de hogaza", "Aguacate", "Tomate", "Limón", "Aceite de oliva", "Sal"],
        [P.vegan, P.vegetarian, P.dairy_free, P.quick, P.light],
        "Toasted country bread topped with mashed avocado and tomato.",
    ),
    # Both (13)
    _r(
        "Gazpacho andaluz",
        B,
        Protein.none,
        15,
        [
            "Tomate maduro",
            "Pepino",
            "Pimiento verde",
            "Ajo",
            "Pan del día anterior",
            "Vinagre de Jerez",
            "Aceite de oliva",
            "Sal",
        ],
        [P.vegan, P.vegetarian, P.dairy_free, P.light, P.quick],
        "Cold raw tomato soup, no cooking needed.",
    ),
    _r(
        "Ensalada de garbanzos",
        B,
        Protein.legumes,
        15,
        [
            "Garbanzos cocidos",
            "Tomate",
            "Pepino",
            "Cebolla morada",
            "Pimiento",
            "Perejil",
            "Limón",
            "Aceite de oliva",
        ],
        [P.vegan, P.vegetarian, P.gluten_free, P.dairy_free, P.light, P.quick],
        "Fresh chickpea salad with lemon dressing.",
    ),
    _r(
        "Pollo al curry con arroz",
        B,
        Protein.poultry,
        40,
        [
            "Pechuga de pollo",
            "Leche de coco",
            "Curry en polvo",
            "Cebolla",
            "Ajo",
            "Jengibre",
            "Arroz basmati",
            "Aceite de oliva",
        ],
        [P.spicy, P.gluten_free, P.dairy_free, P.batch_cooking],
        "Chicken in a mild coconut curry sauce with basmati rice.",
    ),
    _r(
        "Ensalada caprese",
        B,
        Protein.dairy,
        10,
        ["Tomate", "Mozzarella", "Albahaca fresca", "Aceite de oliva", "Sal"],
        [P.vegetarian, P.gluten_free, P.light, P.quick],
        "Tomato, mozzarella and basil.",
    ),
    _r(
        "Sopa de verduras",
        B,
        Protein.none,
        35,
        [
            "Puerro",
            "Zanahoria",
            "Apio",
            "Calabacín",
            "Patata",
            "Caldo de verduras",
            "Aceite de oliva",
        ],
        [P.vegan, P.vegetarian, P.gluten_free, P.dairy_free, P.light, P.batch_cooking],
        "Comforting vegetable soup that keeps well.",
    ),
    _r(
        "Tofu salteado con verduras",
        B,
        Protein.tofu,
        20,
        [
            "Tofu firme",
            "Brócoli",
            "Zanahoria",
            "Pimiento rojo",
            "Salsa de soja",
            "Jengibre",
            "Aceite de sésamo",
        ],
        [P.vegan, P.vegetarian, P.dairy_free, P.quick],
        "Pan-fried tofu with crunchy vegetables and soy sauce.",
    ),
    _r(
        "Pasta al pesto",
        B,
        Protein.dairy,
        15,
        ["Espaguetis", "Albahaca", "Piñones", "Parmesano", "Ajo", "Aceite de oliva"],
        [P.vegetarian, P.quick, P.kid_friendly],
        "Spaghetti with fresh basil pesto.",
    ),
    _r(
        "Hamburguesa casera con boniato",
        B,
        Protein.meat,
        35,
        [
            "Carne picada de ternera",
            "Huevo",
            "Cebolla",
            "Pan de hamburguesa",
            "Boniato",
            "Lechuga",
            "Tomate",
            "Aceite de oliva",
        ],
        [P.kid_friendly, P.dairy_free],
        "Homemade beef burger with oven-roasted sweet potato wedges.",
    ),
    _r(
        "Dorada a la sal con patatas",
        B,
        Protein.fish,
        45,
        ["Dorada entera", "Sal gorda", "Patatas", "Limón", "Perejil", "Aceite de oliva"],
        [P.gluten_free, P.dairy_free, P.light],
        "Sea bream baked in a salt crust with boiled potatoes.",
    ),
    _r(
        "Quesadillas de verduras",
        B,
        Protein.dairy,
        20,
        ["Tortillas de trigo", "Queso rallado", "Pimiento rojo", "Maíz", "Cebolla", "Calabacín"],
        [P.vegetarian, P.quick, P.kid_friendly],
        "Crispy wheat tortillas filled with melted cheese and vegetables.",
    ),
    _r(
        "Albóndigas con puré de patata y guisantes",
        B,
        Protein.meat,
        50,
        [
            "Carne picada mixta",
            "Huevo",
            "Pan rallado",
            "Ajo",
            "Perejil",
            "Patatas",
            "Leche",
            "Mantequilla",
            "Guisantes",
            "Caldo de carne",
            "Aceite de oliva",
        ],
        [P.kid_friendly, P.batch_cooking],
        "Meatballs in a light gravy with creamy mashed potatoes and peas.",
    ),
    _r(
        "Salmón con brócoli",
        B,
        Protein.fish,
        25,
        ["Lomos de salmón", "Brócoli", "Ajo", "Limón", "Aceite de oliva", "Sal"],
        [P.gluten_free, P.dairy_free, P.quick, P.light],
        "Pan-seared salmon with steamed broccoli and garlic.",
    ),
    _r(
        "Pechuga de pollo a la plancha con tomate",
        B,
        Protein.poultry,
        20,
        ["Pechuga de pollo", "Tomate", "Ajo", "Orégano", "Aceite de oliva", "Sal"],
        [P.gluten_free, P.dairy_free, P.quick, P.light, P.kid_friendly],
        "Grilled chicken breast with sliced tomato and oregano.",
    ),
]


def seed_recipes(session: Session) -> int:
    """Insert seed recipes whose names are missing. Return the number inserted."""
    existing = {name.lower() for name in session.exec(select(Recipe.name))}
    inserted = 0
    for data in SEED_RECIPES:
        if data.name.lower() in existing:
            continue
        repository.create_recipe(session, data)
        inserted += 1
    return inserted


def seed_if_empty(session: Session) -> int:
    """Seed only when the recipe table is empty. Return the number inserted."""
    if repository.count_recipes(session) > 0:
        return 0
    return seed_recipes(session)


def main() -> None:
    """CLI entry point: create tables and top up the seed recipes."""
    init_db()
    with Session(get_engine()) as session:
        inserted = seed_recipes(session)
    print(f"Seeded {inserted} new recipe(s) ({len(SEED_RECIPES)} in catalogue).")


if __name__ == "__main__":
    main()
