# Recetas

La lista de recetas es tu catálogo: todo lo que puedes poner en la semana.

![La lista de recetas: buscador, filtro por tipo de comida, favoritas, el botón Filtros y las filas de recetas](images/recipe-panel.png){ .screenshot .dialog }

## Encontrar una receta

- **Busca** por nombre o ingrediente. Mayúsculas, minúsculas y tildes dan igual: «pimenton»
  encuentra «Pimentón».
- **Todas / Comida / Cena** muestra las recetas que caben en esa comida.
- :star: **Favoritas** muestra solo tus favoritas, combinado con los demás filtros.
- **Filtros** (:material-tune-variant:) abre un panel bajo la fila con las opciones de
  **Ordenar** (**A–Z**, **Mejor variedad** y **Hace tiempo que no**, que pone primero las
  recetas que nunca has planificado y después las que planificaste hace más tiempo) y las
  **Propiedades** (vegetariana, vegana, sin gluten, rápida, etc.; la receta debe tener todas
  las que marques). Un número en el botón indica cuántas de estas opciones están activas, y
  **Quitar filtros**, dentro del panel, las restablece.

![El panel de filtros: orden y propiedades, con el número de filtros activos en el botón](images/recipe-filters.png){ .screenshot .dialog }

Una línea bajo los filtros indica cuántas recetas se muestran y cómo están ordenadas («33
recetas · A–Z»).

Cada receta es una fila compacta: su nombre (púlsalo para abrir los detalles), una estrella
discreta para marcarla como favorita y un botón redondo **+** para añadirla a la semana. Bajo
el nombre, una línea tenue muestra la proteína principal (con su punto de color), el tiempo,
«Solo comida» o «Solo cena» si no vale para ambas, y o bien cuántas veces está en la semana
actual («×1 esta semana») o cuándo la preparaste por última vez («Preparada hace 3 días»,
«Nunca planificada» en verde). Las raciones, los ingredientes y las propiedades están en los
detalles. En el ordenador, al pasar el ratón por una fila aparece a su derecha un asa para
arrastrarla.

## Detalles de una receta

Haz clic en el nombre de una receta (o en **Ver detalles** en una comida planificada) para
verlo todo:

![Los detalles de una receta: ingredientes, pasos numerados, historial y propiedades](images/recipe-details.png){ .screenshot .dialog }

- Los ingredientes y los **pasos** numerados, y el enlace a la receta original si lo tiene.
- **Historial**: cuántas veces la has planificado, la próxima vez que está planificada y las
  últimas comidas.
- :star: **Favorita** la marca como favorita. Las favoritas son un atajo para ti; no cambian lo
  que propone **Completar semana**.
- **Editar**, **Archivar** y **Eliminar**, abajo.

## Añadir una receta

Pulsa **Nueva receta**. En el móvil el formulario ocupa toda la pantalla.

![El formulario de receta nueva, con Importar desde un enlace arriba](images/recipe-form.png){ .screenshot .dialog }

| Campo | |
| --- | --- |
| **Nombre** | Obligatorio, único, hasta 80 caracteres |
| **Tipo de comida** | **Comida**, **Cena** o **Ambas**. Decide en qué huecos cabe la receta |
| **Proteína principal** | La usan las comprobaciones de [variedad](variety.md) |
| **Tiempo de preparación**, **Raciones**, **Descripción** | Opcionales |
| **Ingredientes** | Al menos uno. **Intro** añade una fila; al pegar una lista se separa en filas. Escribe las cantidades como quieras («200 g de lentejas») |
| **Pasos** | Opcionales y numerados. Cámbialos de orden con los botones de flecha |
| **Enlace de origen** | Opcional: la página de donde viene la receta |
| **Propiedades** | Vegetariana, vegana, sin gluten, sin lácteos, rápida, picante, ligera, apta para niños, cocina por lotes |

Pulsa **Crear receta** para guardarla.

### Importar una receta desde una página web

En la parte de arriba del formulario, pega la dirección de una página de recetas en
**Importar desde un enlace** y pulsa **Importar**. Cociboard rellena el nombre, la
descripción, las raciones, el tiempo, los ingredientes, los pasos y el enlace de origen.
**No se guarda nada hasta que pulses Crear receta**, así que revisa el resultado y elige tú el
**tipo de comida** y la **proteína principal**: las páginas web no lo indican.

La mayoría de las webs de recetas funcionan, porque publican sus recetas en un formato estándar
para los buscadores. Algunas no (páginas que piden iniciar sesión, PDF, webs que bloquean el
acceso automático); Cociboard te avisa cuando no puede leer una página.

!!! tip "En Android"
    Cuando Cociboard está [instalado en el móvil](phone.md#instalalo-como-una-app), aparece en
    el menú **Compartir**. Comparte una página de recetas desde el navegador y Cociboard abre
    el formulario y la importa.

## Editar una receta

Abre la receta y pulsa **Editar**. Los cambios se ven en todas las semanas donde está
planificada. Si cambias el tipo de comida y la receta está en huecos donde ya no cabe (una
receta de comida que pasa a ser solo de cena, por ejemplo), el formulario te los enseña y
ofrece **Quitarlas y guardar**.

## ¿Archivar o eliminar?

**Archivar** (recomendado)
:   Oculta la receta de la lista y de las sugerencias, pero la mantiene en las semanas donde
    estaba planificada, marcada como «Archivada». La encontrarás en **Archivadas (N)**, al final
    de la lista, y puedes recuperarla con **Restaurar**.

**Eliminar**
:   Borra la receta para siempre, junto con todas las comidas que la usan, también en semanas
    pasadas. La confirmación te dice cuántas comidas desaparecerán y te sugiere
    **Archivar en su lugar**.
