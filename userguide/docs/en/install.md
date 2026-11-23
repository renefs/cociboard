# Installing Cociboard

This page is for whoever sets up Cociboard for the household. Cociboard is a small web server
that keeps all data in one file. It is meant to run at home, for example on a NAS or a small
server, using Docker.

## Quick start with Docker Compose

1. Create a folder (for example `cociboard`) and save in it the file
   [`docker-compose.ghcr.yml`](https://github.com/renefs/cociboard/blob/main/docker-compose.ghcr.yml)
   from the repository, renamed to `docker-compose.yml`.
2. Optionally create a `.env` file next to it with your settings (see below).
3. Start it:

    ```sh
    docker compose pull
    docker compose up -d
    ```

4. Open `http://<your-server>:8000`.

The data lives in the `data` folder next to `docker-compose.yml`. To update Cociboard, run the
same two commands again: the data is kept and upgraded automatically, after making a copy of it.

### Synology NAS without SSH

Everything works from DSM. Upload the folder with `docker-compose.yml` (and `.env`, if you made
one) with File Station, then in Container Manager choose **Project → Create** and pick the
folder: it downloads the image, no sign-in needed.

In Container Manager, starting the project again or choosing **Action → Build** (**Create** in
some languages) does not download a newer `latest` while the old image is still on the NAS.
Either:

- stop the project, delete the `ghcr.io/renefs/cociboard` image under **Image**, then choose
  **Build** and **Start**; or
- put a version number in `.env`, for example `COCIBOARD_TAG=0.28.2` (File Station can edit
  the file), then choose **Build** and **Start**. Change the number for each update.

The `data` folder is kept either way. `http://<your-server>:8000/api/health` shows the version
that is running.

## Main settings

Put these in the `.env` file. All are optional.

| Setting | Default | What it does |
| --- | --- | --- |
| `COCIBOARD_PORT` | `8000` | Port on the server |
| `TZ` | `Etc/UTC` | Your time zone, which decides what "today" is (e.g. `Europe/Madrid`) |
| `PUID` / `PGID` | `1000` / `1000` | Owner of the `data` folder |
| `COCIBOARD_PASSWORD_HASH` | not set | Household password, see below |
| `COCIBOARD_BACKUP_INTERVAL_HOURS` | `24` | Hours between automatic copies of the data (`0` turns them off) |
| `COCIBOARD_BACKUPS_KEPT` | `7` | How many automatic copies to keep |
| `COCIBOARD_RECIPE_IMPORT` | `true` | `false` hides "Import from a link" |

## Security

Without a password, anyone who can reach the address can see and change the plans. That is
fine at home; if Cociboard is reachable from the internet, set a household password:

```sh
docker compose run --rm cociboard python -m cociboard.auth hash
```

The command asks for the password and prints a line starting with `scrypt:`. Put it in `.env`
as `COCIBOARD_PASSWORD_HASH=...` and restart. Changing the password signs everyone out.

Also put Cociboard behind a reverse proxy with **HTTPS** (on a Synology NAS: Control Panel →
Login Portal → Advanced → Reverse Proxy). HTTPS protects the password and is required for the
[offline mode](phone.md#without-a-connection) and for installing the app on phones.

## More

The project's [README](https://github.com/renefs/cociboard#readme) has the complete reference:
building from source, every setting, Synology step by step, restoring the automatic copies and
the API.
