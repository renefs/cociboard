# Instalar Cociboard

Esta página es para quien instala Cociboard en casa. Cociboard es un pequeño servidor web que
guarda todos los datos en un solo archivo. Está pensado para funcionar en casa, por ejemplo en
un NAS o un pequeño servidor, con Docker.

## Inicio rápido con Docker Compose

1. Crea una carpeta (por ejemplo `cociboard`) y guarda en ella el archivo
   [`docker-compose.ghcr.yml`](https://github.com/renefs/cociboard/blob/main/docker-compose.ghcr.yml)
   del repositorio, con el nombre `docker-compose.yml`.
2. Si quieres, crea un archivo `.env` a su lado con tus ajustes (ver abajo).
3. Arráncalo:

    ```sh
    docker compose pull
    docker compose up -d
    ```

4. Abre `http://<tu-servidor>:8000`.

Los datos están en la carpeta `data`, junto a `docker-compose.yml`. Para actualizar Cociboard,
repite los dos comandos: los datos se conservan y se actualizan solos, después de hacer una
copia.

### NAS Synology sin SSH

Todo se hace desde DSM. Sube la carpeta con `docker-compose.yml` (y `.env`, si lo has creado) con
File Station y, en Container Manager, elige **Proyecto → Crear** y selecciona la carpeta: descarga
la imagen sin necesidad de iniciar sesión.

En Container Manager, volver a iniciar el proyecto o elegir **Acción → Crear** no descarga un
`latest` más nuevo mientras la imagen antigua siga en el NAS. Elige una de estas dos opciones:

- detén el proyecto, borra la imagen `ghcr.io/renefs/cociboard` en **Imagen** y después elige
  **Crear** e **Iniciar**; o
- pon un número de versión en `.env`, por ejemplo `COCIBOARD_TAG=0.28.2` (File Station puede
  editar el archivo), y elige **Crear** e **Iniciar**. Cambia el número en cada actualización.

La carpeta `data` se conserva en los dos casos. `http://<tu-servidor>:8000/api/health` muestra la
versión que está funcionando.

## Ajustes principales

Ponlos en el archivo `.env`. Todos son opcionales.

| Ajuste | Por defecto | Para qué sirve |
| --- | --- | --- |
| `COCIBOARD_PORT` | `8000` | Puerto en el servidor |
| `TZ` | `Etc/UTC` | Tu zona horaria, que decide qué día es «hoy» (p. ej. `Europe/Madrid`) |
| `PUID` / `PGID` | `1000` / `1000` | Propietario de la carpeta `data` |
| `COCIBOARD_PASSWORD_HASH` | sin definir | Contraseña de la casa, ver abajo |
| `COCIBOARD_BACKUP_INTERVAL_HOURS` | `24` | Horas entre copias automáticas (`0` las desactiva) |
| `COCIBOARD_BACKUPS_KEPT` | `7` | Cuántas copias automáticas se guardan |
| `COCIBOARD_RECIPE_IMPORT` | `true` | `false` oculta «Importar desde un enlace» |

## Seguridad

Sin contraseña, cualquiera que llegue a la dirección puede ver y cambiar los menús. En casa no
pasa nada; si Cociboard es accesible desde internet, pon una contraseña:

```sh
docker compose run --rm cociboard python -m cociboard.auth hash
```

El comando pide la contraseña y muestra una línea que empieza por `scrypt:`. Ponla en `.env`
como `COCIBOARD_PASSWORD_HASH=...` y reinicia. Cambiar la contraseña cierra la sesión de todos.

Pon además Cociboard detrás de un proxy inverso con **HTTPS** (en un NAS Synology: Panel de
control → Portal de inicio de sesión → Avanzado → Proxy inverso). HTTPS protege la contraseña y
es necesario para el [modo sin conexión](phone.md#sin-conexion) y para instalar la app en el
móvil.

## Más información

El [README](https://github.com/renefs/cociboard#readme) del proyecto (en inglés) tiene la
referencia completa: compilar desde el código, todos los ajustes, Synology paso a paso,
restaurar las copias automáticas y la API.
