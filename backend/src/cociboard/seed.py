"""Idempotent seed data: a varied, Mediterranean/Spanish-friendly recipe set.

Run on startup when the database is empty (``COCIBOARD_SEED_ON_STARTUP``) or manually
with ``python -m cociboard.seed`` / ``make seed``. The manual run also fills in the steps
and servings of seed recipes that were added before the catalogue had them (v0.27.0).
"""

from typing import NamedTuple

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
    *,
    servings: int,
    steps: list[str],
) -> RecipeCreate:
    return RecipeCreate(
        name=name,
        description=description,
        meal_type=meal_type,
        protein=protein,
        prep_minutes=prep,
        ingredients=ingredients,
        properties=properties,
        servings=servings,
        steps=steps,
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
        servings=4,
        steps=[
            "Pica la cebolla, el pimiento verde y el ajo, corta la zanahoria en rodajas y el chorizo en trozos.",
            "Sofríe la cebolla, el pimiento y la zanahoria en una olla con 3 cucharadas de aceite a fuego medio durante 8 minutos.",
            "Añade el ajo, el chorizo y el pimentón dulce y remueve 30 segundos, sin dejar que se queme el pimentón.",
            "Incorpora las lentejas y el laurel, cúbrelo todo con agua fría hasta dos dedos por encima y sazona con sal y pimienta.",
            "Lleva a ebullición, baja el fuego y cuece 35 minutos con la olla semitapada, hasta que las lentejas estén tiernas.",
            "Retira el laurel, rectifica de sal y deja reposar 5 minutos antes de servir.",
        ],
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
        servings=4,
        steps=[
            "Calienta el caldo de pescado con el azafrán y mantenlo a fuego bajo. Limpia los mejillones y corta el calamar en anillas.",
            "Sofríe las gambas 1 minuto en la paellera con un chorro de aceite a fuego fuerte y resérvalas.",
            "En el mismo aceite sofríe el calamar, el pimiento rojo en tiras y el ajo picado durante 5 minutos a fuego medio.",
            "Añade el tomate rallado, salpimienta y cocina 8 minutos, hasta que pierda el agua y se espese.",
            "Echa el arroz, remuévelo 1 minuto y vierte el caldo caliente (unas 2,5 veces el volumen del arroz). Cuece 10 minutos a fuego fuerte sin remover.",
            "Reparte los mejillones y las gambas por encima, baja el fuego y cuece 8 minutos más.",
            "Retira del fuego y deja reposar 5 minutos tapada con un paño antes de servir.",
        ],
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
        servings=6,
        steps=[
            "Deja los garbanzos en remojo en agua con sal la noche anterior (este tiempo no cuenta en la preparación).",
            "Pon el morcillo, el pollo y el tocino en una olla grande, cúbrelos con agua fría, llévalos a ebullición a fuego fuerte y retira la espuma.",
            "Añade los garbanzos escurridos, baja el fuego y cuece tapado 1 hora y 15 minutos.",
            "Incorpora el chorizo, las zanahorias y las patatas troceadas, y cuece 30 minutos más.",
            "Aparte, cuece el repollo en agua con sal 20 minutos y escúrrelo.",
            "Cuela unos 1,5 litros de caldo, llévalo a ebullición y cuece los fideos 5 minutos para servir la sopa primero.",
            "Sirve después los garbanzos con las verduras y, al final, las carnes troceadas.",
        ],
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
        servings=4,
        steps=[
            "Salpimienta los muslos y dóralos en una cazuela con 2 cucharadas de aceite a fuego medio-alto, 4 minutos por lado. Resérvalos.",
            "En el mismo aceite sofríe la cebolla picada, el pimiento rojo en dados y el ajo a fuego medio durante 8 minutos.",
            "Añade el arroz y remueve 1 minuto para que se impregne del sofrito.",
            "Devuelve el pollo a la cazuela, vierte el caldo de pollo caliente (el doble de volumen que de arroz) e incorpora los guisantes.",
            "Cuece 5 minutos a fuego fuerte y después 15 minutos a fuego suave, tapado y sin remover.",
            "Deja reposar 5 minutos antes de servir.",
        ],
    ),
    _r(
        "Macarrones con tomate y atún",
        L,
        Protein.fish,
        25,
        ["Macarrones", "Tomate frito", "Atún en lata", "Cebolla", "Aceite de oliva"],
        [P.quick, P.dairy_free, P.kid_friendly],
        "Weekday pasta with tomato sauce and tinned tuna.",
        servings=4,
        steps=[
            "Pon a hervir abundante agua con sal en una olla grande.",
            "Pica la cebolla y sofríela con 2 cucharadas de aceite a fuego medio durante 6 minutos, hasta que esté transparente.",
            "Añade el tomate frito y cocina 5 minutos a fuego bajo.",
            "Cuece los macarrones el tiempo indicado en el envase (unos 10 minutos) y escúrrelos.",
            "Incorpora el atún escurrido a la salsa, caliéntalo 1 minuto y mezcla con la pasta.",
        ],
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
        servings=4,
        steps=[
            "Escurre y enjuaga los garbanzos cocidos.",
            "Machaca en un mortero 1 diente de ajo, el pan frito, el comino y 1 cucharada de vinagre con un chorrito de agua hasta obtener una pasta.",
            "Sofríe 2 dientes de ajo laminados con 3 cucharadas de aceite a fuego medio durante 1 minuto y añade el pimentón dulce, removiendo 10 segundos.",
            "Añade las espinacas lavadas y cocínalas 5 minutos, hasta que reduzcan su volumen.",
            "Incorpora los garbanzos, la pasta machacada y 200 ml de agua, y cuece 15 minutos a fuego lento hasta que espese.",
            "Salpimienta, ajusta el vinagre al gusto y deja reposar 5 minutos antes de servir.",
        ],
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
        servings=4,
        steps=[
            "Hidrata los pimientos choriceros en agua caliente durante 20 minutos y rasca la pulpa con una cuchara.",
            "Pica la cebolla, el pimiento verde y el ajo, y pocha todo en una cazuela con 4 cucharadas de aceite a fuego bajo durante 20 minutos, sin que se dore.",
            "Añade el tomate triturado y la pulpa de los choriceros, y cuece 10 minutos a fuego medio.",
            "Tritura la salsa si la prefieres fina y sazona con poca sal, porque el bacalao ya la lleva.",
            "Seca los lomos de bacalao y colócalos con la piel hacia arriba sobre la salsa.",
            "Cuece a fuego muy suave 10 minutos, moviendo la cazuela de vez en cuando sin remover.",
        ],
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
            "Aceite de oliva",
        ],
        [P.kid_friendly, P.batch_cooking],
        "Meatballs in tomato sauce served with white rice.",
        servings=4,
        steps=[
            "Mezcla la carne con el huevo, el pan rallado empapado en 3 cucharadas de leche, el perejil picado, sal y pimienta. Forma bolas de 3 cm.",
            "Dóralas en una sartén con aceite a fuego medio-alto durante 5 minutos, girándolas, y resérvalas.",
            "En el mismo aceite sofríe la cebolla y la zanahoria picadas a fuego medio durante 10 minutos.",
            "Añade el tomate triturado y 200 ml de agua, salpimienta y cuece 10 minutos.",
            "Incorpora las albóndigas y cuece tapadas 15 minutos a fuego lento.",
            "Mientras tanto, cuece el arroz en agua con sal unos 15 minutos y escúrrelo.",
            "Sirve las albóndigas con su salsa sobre el arroz.",
        ],
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
        servings=6,
        steps=[
            "Sofríe la cebolla, la zanahoria y el ajo picados con 3 cucharadas de aceite a fuego medio durante 10 minutos.",
            "Añade la carne picada y cocínala 8 minutos desmenuzándola. Incorpora el tomate triturado, sal y pimienta, y cuece 20 minutos a fuego bajo.",
            "Prepara la bechamel: derrite 50 g de mantequilla, añade 50 g de harina y cocina 1 minuto. Vierte poco a poco 600 ml de leche templada removiendo, cuece 8 minutos hasta que espese y sazona con sal y nuez moscada.",
            "Precalienta el horno a 200 ºC. Si las placas no son de las que se hornean directamente, cuécelas antes en agua con sal según el envase.",
            "Monta la lasaña en una fuente: una capa de salsa, placas, carne y bechamel, y repite hasta tres capas. Termina con bechamel y el queso rallado.",
            "Hornea 25 minutos, hasta que esté gratinada, y deja reposar 10 minutos antes de cortar.",
        ],
    ),
    _r(
        "Pasta con tomate y bonito",
        L,
        Protein.fish,
        25,
        ["Pasta corta", "Tomate frito", "Bonito en aceite", "Cebolla", "Ajo", "Aceite de oliva"],
        [P.quick, P.dairy_free, P.kid_friendly],
        "Short pasta with tomato sauce and tinned bonito.",
        servings=4,
        steps=[
            "Cuece la pasta en abundante agua con sal el tiempo indicado en el envase (unos 10 minutos).",
            "Mientras, sofríe la cebolla y el ajo picados con 2 cucharadas de aceite a fuego medio durante 6 minutos.",
            "Añade el tomate frito y cocina 5 minutos a fuego bajo.",
            "Desmenuza el bonito escurrido, añádelo a la salsa y caliéntalo 2 minutos.",
            "Escurre la pasta guardando un vaso del agua de cocción, mézclala con la salsa 1 minuto a fuego bajo y añade un poco de agua si queda seca.",
        ],
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
        servings=4,
        steps=[
            "Pela las patatas y córtalas en láminas finas. Pica la cebolla.",
            "Fríe las patatas y la cebolla en abundante aceite a fuego medio-bajo durante 20 minutos, hasta que estén tiernas sin dorarse, y escúrrelas.",
            "Bate 6 huevos con sal, mézclalos con las patatas y la cebolla y deja reposar 5 minutos.",
            "Cuaja la mezcla en una sartén antiadherente con 1 cucharada de aceite a fuego medio durante 4 minutos, hasta que se dore por abajo.",
            "Dale la vuelta con ayuda de un plato y cuaja 3 minutos más por el otro lado.",
        ],
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
        servings=4,
        steps=[
            "Precalienta el horno a 200 ºC.",
            "Corta el calabacín en rodajas, el pimiento rojo en tiras y la cebolla en juliana. Colócalos en una bandeja con 3 cucharadas de aceite, sal y pimienta.",
            "Hornea las verduras 15 minutos.",
            "Coloca los lomos de salmón sobre las verduras, salpimienta, rocía con zumo de limón y espolvorea el eneldo.",
            "Hornea 12 minutos más, hasta que el salmón se desmenuce con facilidad.",
            "Sirve con gajos de limón.",
        ],
    ),
    _r(
        "Crema de calabacín",
        D,
        Protein.dairy,
        30,
        ["Calabacín", "Patata", "Puerro", "Quesitos", "Caldo de verduras", "Aceite de oliva"],
        [P.vegetarian, P.gluten_free, P.light, P.kid_friendly],
        "Smooth zucchini soup with cheese portions.",
        servings=4,
        steps=[
            "Trocea el calabacín sin pelar, pela y trocea la patata y corta el puerro en rodajas.",
            "Rehoga el puerro en una olla con 2 cucharadas de aceite a fuego medio durante 5 minutos.",
            "Añade el calabacín y la patata, rehoga 3 minutos, cubre con unos 700 ml de caldo de verduras y sala.",
            "Cuece 15 minutos a fuego medio, hasta que la patata esté tierna.",
            "Añade los quesitos y tritura hasta obtener una crema fina. Ajusta el espesor con un poco de agua y rectifica de sal.",
            "Sirve caliente con un poco de pimienta.",
        ],
    ),
    _r(
        "Revuelto de gambas y ajetes",
        D,
        Protein.seafood,
        15,
        ["Gambas peladas", "Ajetes tiernos", "Huevos", "Aceite de oliva", "Sal"],
        [P.quick, P.gluten_free, P.dairy_free],
        "Soft scrambled eggs with prawns and young garlic.",
        servings=4,
        steps=[
            "Lava los ajetes y córtalos en trozos de 2 cm. Seca las gambas con papel de cocina y salpimiéntalas.",
            "Sofríe los ajetes en una sartén con 2 cucharadas de aceite a fuego medio durante 4 minutos.",
            "Sube el fuego y saltea las gambas 1 o 2 minutos, hasta que cambien de color.",
            "Bate los huevos con sal y pimienta, viértelos en la sartén y baja el fuego.",
            "Remueve sin parar durante 2 minutos, hasta que cuajen pero sigan cremosos, y sirve de inmediato.",
        ],
    ),
    _r(
        "Pechuga a la plancha con ensalada",
        D,
        Protein.poultry,
        20,
        ["Pechuga de pollo", "Lechuga", "Tomate", "Pepino", "Limón", "Aceite de oliva"],
        [P.quick, P.light, P.gluten_free, P.dairy_free],
        "Grilled chicken breast with a fresh side salad.",
        servings=4,
        steps=[
            "Lava y trocea la lechuga, el tomate y el pepino, y mezcla todo en una ensaladera.",
            "Aliña con el zumo de medio limón, 3 cucharadas de aceite y sal. Reserva.",
            "Aplana las pechugas hasta 1,5 cm de grosor y salpimiéntalas.",
            "Calienta la plancha a fuego fuerte con unas gotas de aceite y cocina las pechugas 4 minutos por lado, hasta que no queden rosadas por dentro.",
            "Deja reposar la carne 3 minutos, córtala en tiras y sírvela sobre la ensalada.",
        ],
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
        servings=4,
        steps=[
            "Pica la cebolla, los pimientos y el calabacín en dados de 1 cm, y trocea el tomate.",
            "Pocha la cebolla y los pimientos en una sartén grande con 4 cucharadas de aceite a fuego medio-bajo durante 10 minutos.",
            "Añade el calabacín y cocina 8 minutos más.",
            "Incorpora el tomate, sala y cuece 15 minutos a fuego bajo removiendo de vez en cuando, hasta que espese.",
            "Fríe los huevos en otra sartén con aceite bien caliente durante 2 minutos, hasta que la clara esté cuajada.",
            "Sirve el pisto con un huevo frito encima de cada ración.",
        ],
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
        servings=4,
        steps=[
            "Salpimienta la carne y forma 4 hamburguesas de unos 150 g y 2 cm de grosor.",
            "Corta la cebolla en aros finos y el tomate en rodajas, y lava la lechuga.",
            "Calienta la plancha con un chorrito de aceite a fuego fuerte y cocina las hamburguesas 4 minutos por lado.",
            "Pon una loncha de queso sobre cada una durante el último minuto y tapa para que se funda.",
            "Tuesta los panes abiertos 1 minuto en la plancha.",
            "Monta cada hamburguesa con lechuga, carne con queso, tomate y cebolla.",
        ],
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
        servings=6,
        steps=[
            "Pela y trocea la calabaza, la zanahoria y la patata en dados de 2 cm. Pica la cebolla.",
            "Rehoga la cebolla en una olla con 2 cucharadas de aceite a fuego medio durante 5 minutos.",
            "Añade la calabaza, la zanahoria y la patata, y rehoga 2 minutos.",
            "Cubre apenas con unos 600 ml de caldo de verduras, sala y cuece 20 minutos tapado, hasta que todo esté tierno.",
            "Tritura hasta obtener un puré suave, añadiendo agua o caldo si queda espeso, y rectifica de sal.",
            "Si lo guardas, déjalo enfriar y consérvalo en recipientes cerrados en la nevera hasta 3 días.",
        ],
    ),
    _r(
        "Tortilla francesa",
        D,
        Protein.eggs,
        10,
        ["Huevos", "Aceite de oliva", "Sal"],
        [P.vegetarian, P.gluten_free, P.dairy_free, P.quick, P.light, P.kid_friendly],
        "Plain folded omelette, ready in minutes.",
        servings=2,
        steps=[
            "Bate 4 huevos con una pizca de sal hasta que no queden hebras de clara.",
            "Calienta una sartén pequeña con unas gotas de aceite a fuego medio-alto durante 1 minuto.",
            "Vierte los huevos y remueve con un tenedor 20 segundos.",
            "Déjalos cuajar 30 segundos sin tocar y dobla la tortilla en dos.",
            "Cocina 30 segundos más, desliza al plato y sirve de inmediato.",
        ],
    ),
    _r(
        "Tosta de aguacate",
        D,
        Protein.none,
        10,
        ["Pan de hogaza", "Aguacate", "Tomate", "Limón", "Aceite de oliva", "Sal"],
        [P.vegan, P.vegetarian, P.dairy_free, P.quick, P.light],
        "Toasted country bread topped with mashed avocado and tomato.",
        servings=2,
        steps=[
            "Tuesta las rebanadas de pan 2 o 3 minutos.",
            "Pela el aguacate y machácalo con un tenedor con un chorrito de zumo de limón, sal y pimienta.",
            "Corta el tomate en rodajas finas.",
            "Unta el aguacate sobre las tostadas.",
            "Cubre con el tomate, un hilo de aceite y una pizca de sal, y sirve enseguida.",
        ],
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
        servings=4,
        steps=[
            "Remoja el pan en agua 5 minutos y escúrrelo.",
            "Trocea los tomates, el pepino pelado, el pimiento sin semillas y el ajo sin el germen.",
            "Tritura todo con el pan, 80 ml de aceite, 2 cucharadas de vinagre de Jerez y sal hasta obtener una crema fina.",
            "Si quieres una textura más sedosa, pásalo por un colador fino.",
            "Añade agua fría si está espeso y rectifica de sal y de vinagre.",
            "Enfría en la nevera al menos 2 horas y sirve muy frío con un chorrito de aceite.",
        ],
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
        servings=4,
        steps=[
            "Escurre los garbanzos y enjuágalos con agua fría.",
            "Corta el tomate, el pepino y el pimiento en dados pequeños, la cebolla morada en juliana fina y pica el perejil.",
            "Prepara el aliño mezclando el zumo de 1 limón, 4 cucharadas de aceite, sal y pimienta.",
            "Mezcla los garbanzos con las verduras y el aliño.",
            "Deja reposar 5 minutos para que se integren los sabores y sirve.",
        ],
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
        servings=4,
        steps=[
            "Corta la pechuga en dados de 2 cm y salpimiéntala. Pica la cebolla y el ajo, y ralla el jengibre.",
            "Sofríe la cebolla en una sartén honda con 2 cucharadas de aceite a fuego medio durante 6 minutos. Añade el ajo y el jengibre y cocina 1 minuto.",
            "Sube el fuego a medio-alto, añade el pollo y dóralo 5 minutos.",
            "Espolvorea 2 cucharadas de curry, remueve 30 segundos y vierte la leche de coco con 100 ml de agua.",
            "Cuece a fuego suave 15 minutos, hasta que la salsa espese y el pollo esté hecho. Sazona con sal.",
            "Mientras, lava el arroz basmati, cuécelo 12 minutos en agua con sal y escúrrelo.",
            "Sirve el pollo con su salsa junto al arroz.",
        ],
    ),
    _r(
        "Ensalada caprese",
        B,
        Protein.dairy,
        10,
        ["Tomate", "Mozzarella", "Albahaca fresca", "Aceite de oliva", "Sal"],
        [P.vegetarian, P.gluten_free, P.light, P.quick],
        "Tomato, mozzarella and basil.",
        servings=4,
        steps=[
            "Saca la mozzarella de su líquido y sécala con papel de cocina.",
            "Lava los tomates y córtalos en rodajas de 1 cm. Corta la mozzarella en rodajas del mismo grosor.",
            "Alterna las rodajas de tomate y de mozzarella en una fuente.",
            "Reparte las hojas de albahaca por encima y sazona con sal y pimienta.",
            "Aliña con un chorro de aceite y sirve a temperatura ambiente.",
        ],
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
        servings=6,
        steps=[
            "Pela la zanahoria y la patata, y córtalas con el apio y el calabacín en dados de 1 cm. Corta el puerro en rodajas.",
            "Rehoga el puerro y el apio en una olla con 2 cucharadas de aceite a fuego medio durante 5 minutos.",
            "Añade la zanahoria y la patata y remueve 2 minutos.",
            "Vierte 1,2 litros de caldo de verduras y lleva a ebullición.",
            "Baja el fuego, cuece 15 minutos, añade el calabacín y cuece 5 minutos más.",
            "Rectifica de sal y pimienta, y guarda lo que sobre en la nevera hasta 3 días.",
        ],
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
        servings=4,
        steps=[
            "Envuelve el tofu en papel de cocina y presiónalo 10 minutos con un peso. Córtalo en dados de 2 cm.",
            "Corta el brócoli en ramilletes, la zanahoria en bastones finos y el pimiento en tiras. Ralla el jengibre.",
            "Calienta 2 cucharadas de aceite de sésamo en una sartén grande a fuego medio-alto y dora el tofu 6 minutos. Resérvalo.",
            "En la misma sartén saltea la zanahoria y el brócoli 4 minutos, añade el pimiento y el jengibre y cocina 2 minutos más.",
            "Devuelve el tofu, añade 3 cucharadas de salsa de soja y 2 de agua, y saltea 1 minuto.",
            "Sirve enseguida.",
        ],
    ),
    _r(
        "Pasta al pesto",
        B,
        Protein.dairy,
        15,
        ["Espaguetis", "Albahaca", "Piñones", "Parmesano", "Ajo", "Aceite de oliva"],
        [P.vegetarian, P.quick, P.kid_friendly],
        "Spaghetti with fresh basil pesto.",
        servings=4,
        steps=[
            "Cuece los espaguetis en abundante agua con sal el tiempo indicado en el envase (8 a 10 minutos).",
            "Mientras, tuesta los piñones en una sartén sin aceite a fuego medio durante 2 minutos.",
            "Tritura la albahaca con los piñones, 1 diente de ajo, 40 g de parmesano rallado, 100 ml de aceite y sal hasta obtener una salsa espesa.",
            "Guarda un vaso del agua de cocción y escurre la pasta.",
            "Mezcla la pasta con el pesto fuera del fuego, añadiendo 2 o 3 cucharadas del agua de cocción para que quede cremosa.",
            "Sirve con un poco más de parmesano por encima.",
        ],
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
        servings=4,
        steps=[
            "Precalienta el horno a 220 ºC.",
            "Corta el boniato sin pelar en gajos y mézclalo en una bandeja con 2 cucharadas de aceite, sal y pimienta.",
            "Hornea 25 minutos, dándoles la vuelta a mitad de cocción.",
            "Mezcla la carne con el huevo, la cebolla picada muy fina, sal y pimienta, y forma 4 hamburguesas.",
            "Cocínalas en una sartén con un chorrito de aceite a fuego fuerte, 4 minutos por lado.",
            "Tuesta los panes, monta las hamburguesas con lechuga y tomate, y sírvelas con los gajos de boniato.",
        ],
    ),
    _r(
        "Dorada a la sal con patatas",
        B,
        Protein.fish,
        45,
        ["Dorada entera", "Sal gorda", "Patatas", "Limón", "Perejil", "Aceite de oliva"],
        [P.gluten_free, P.dairy_free, P.light],
        "Sea bream baked in a salt crust with boiled potatoes.",
        servings=4,
        steps=[
            "Precalienta el horno a 200 ºC.",
            "Pela las patatas, trocéalas y cuécelas 20 minutos en agua con sal, hasta que estén tiernas.",
            "Mezcla la sal gorda con 2 o 3 cucharadas de agua hasta que parezca arena húmeda.",
            "Extiende una capa de sal en una bandeja, coloca encima 2 doradas limpias rellenas con rodajas de limón y perejil, y cúbrelas con el resto de la sal.",
            "Hornea 25 minutos.",
            "Rompe la costra de sal, retira la piel y separa los lomos.",
            "Aliña el pescado y las patatas con aceite, zumo de limón y perejil picado.",
        ],
    ),
    _r(
        "Quesadillas de verduras",
        B,
        Protein.dairy,
        20,
        [
            "Tortillas de trigo",
            "Queso rallado",
            "Pimiento rojo",
            "Maíz",
            "Cebolla",
            "Calabacín",
            "Aceite de oliva",
        ],
        [P.vegetarian, P.quick, P.kid_friendly],
        "Crispy wheat tortillas filled with melted cheese and vegetables.",
        servings=4,
        steps=[
            "Pica la cebolla, el pimiento rojo y el calabacín en dados pequeños.",
            "Saltéalos con 1 cucharada de aceite a fuego medio durante 7 minutos, añade el maíz escurrido, cocina 1 minuto más y salpimienta.",
            "Reparte el queso rallado y las verduras sobre la mitad de cada tortilla y dóblalas.",
            "Cocina cada quesadilla en una sartén sin aceite a fuego medio, 2 minutos por lado, hasta que esté dorada y el queso fundido.",
            "Córtalas en triángulos y sirve calientes.",
        ],
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
        servings=4,
        steps=[
            "Mezcla la carne con el huevo, el pan rallado, 1 ajo picado, el perejil picado, sal y pimienta, y forma bolas de 3 cm.",
            "Pela y trocea las patatas y cuécelas en agua con sal durante 20 minutos.",
            "Dora las albóndigas en una sartén con aceite a fuego medio-alto 5 minutos. Añade 250 ml de caldo de carne, tapa y cuece 15 minutos a fuego bajo.",
            "Incorpora los guisantes a la salsa durante los últimos 5 minutos.",
            "Escurre las patatas y machácalas con 30 g de mantequilla y 100 ml de leche tibia hasta obtener un puré liso. Sazona con sal.",
            "Sirve las albóndigas con su salsa y los guisantes junto al puré.",
        ],
    ),
    _r(
        "Salmón con brócoli",
        B,
        Protein.fish,
        25,
        ["Lomos de salmón", "Brócoli", "Ajo", "Limón", "Aceite de oliva", "Sal"],
        [P.gluten_free, P.dairy_free, P.quick, P.light],
        "Pan-seared salmon with steamed broccoli and garlic.",
        servings=4,
        steps=[
            "Corta el brócoli en ramilletes y cuécelo al vapor 6 o 7 minutos, hasta que esté tierno pero firme.",
            "Lamina los ajos. Seca los lomos de salmón y salpimiéntalos.",
            "Calienta 1 cucharada de aceite en una sartén a fuego medio-alto y cocina el salmón con la piel hacia abajo 4 minutos. Dale la vuelta y cocina 2 o 3 minutos más.",
            "Retira el salmón y dora el ajo en la misma sartén 1 minuto a fuego bajo.",
            "Mezcla el brócoli con el ajo y un chorrito de zumo de limón.",
            "Sirve el salmón con el brócoli y gajos de limón.",
        ],
    ),
    _r(
        "Pechuga de pollo a la plancha con tomate",
        B,
        Protein.poultry,
        20,
        ["Pechuga de pollo", "Tomate", "Ajo", "Orégano", "Aceite de oliva", "Sal"],
        [P.gluten_free, P.dairy_free, P.quick, P.light, P.kid_friendly],
        "Grilled chicken breast with sliced tomato and oregano.",
        servings=4,
        steps=[
            "Aplana las pechugas hasta 1,5 cm de grosor y sazónalas con sal, pimienta y orégano.",
            "Corta el tomate en rodajas, y pica el ajo muy fino.",
            "Calienta la plancha a fuego fuerte con un chorrito de aceite.",
            "Cocina las pechugas 4 minutos por lado, hasta que no queden rosadas por dentro, y déjalas reposar 3 minutos.",
            "Aliña el tomate con el ajo, aceite, orégano y sal.",
            "Corta el pollo en tiras y sírvelo con el tomate.",
        ],
    ),
]


class SeedResult(NamedTuple):
    """What a seed run did: recipes inserted and existing recipes given steps/servings."""

    inserted: int
    filled: int


def should_fill_content(steps: list[str], servings: int | None) -> bool:
    """Whether an existing seed recipe still has the pre-v0.27.0 blank content.

    Only a recipe with no steps and no servings is filled; anything the user set (even just
    the servings) is left alone. Archived recipes are filled like any other: it is harmless
    and keeps them complete if they are restored.
    """
    return not steps and servings is None


def seed_recipes(session: Session) -> SeedResult:
    """Insert seed recipes whose names are missing and fill the blank ones.

    Names are matched case-insensitively. Existing recipes are only touched by
    :func:`should_fill_content`; nothing else about them changes.
    """
    existing = {r.name.lower(): r for r in session.exec(select(Recipe))}
    inserted = 0
    filled = 0
    for data in SEED_RECIPES:
        recipe = existing.get(data.name.lower())
        if recipe is None:
            repository.create_recipe(session, data)
            inserted += 1
        elif should_fill_content(recipe.steps, recipe.servings):
            recipe.steps = list(data.steps)
            recipe.servings = data.servings
            session.add(recipe)
            filled += 1
    session.commit()
    return SeedResult(inserted, filled)


def seed_if_empty(session: Session) -> int:
    """Seed only when the recipe table is empty. Return the number inserted."""
    if repository.count_recipes(session) > 0:
        return 0
    return seed_recipes(session).inserted


def main() -> None:
    """CLI entry point: create tables, top up the seed recipes and fill blank ones."""
    init_db()
    with Session(get_engine()) as session:
        result = seed_recipes(session)
    print(
        f"Seeded {result.inserted} new recipe(s), filled steps for {result.filled} "
        f"existing recipe(s) ({len(SEED_RECIPES)} in catalogue)."
    )


if __name__ == "__main__":
    main()
