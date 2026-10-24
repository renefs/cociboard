#!/bin/sh
# Started as root (the default): make /data writable for PUID:PGID, then drop to that
# user. Bind-mounted folders on a NAS usually belong to a NAS user (on Synology, `id` in
# an SSH session shows e.g. uid=1026 gid=100). Started with `user:` set: run as is.
set -e

if [ "$(id -u)" = "0" ]; then
    mkdir -p /data
    chown -R "${PUID}:${PGID}" /data
    exec setpriv --reuid="${PUID}" --regid="${PGID}" --clear-groups -- "$@"
fi

exec "$@"
