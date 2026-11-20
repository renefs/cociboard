#!/bin/sh
# Starts a built Cociboard image and checks that it works (ADR-0021): /api/health answers
# within 60 s with the version in VERSION, and / serves the frontend (200).
# Usage: scripts/smoke-test.sh <image> [port]   (run from the repository root)
# CONTAINER_ENGINE=podman scripts/smoke-test.sh cociboard:smoke  runs it with podman.
# POSIX sh; needs curl. Always removes the container and the throwaway volume.
set -u

image=${1:?usage: scripts/smoke-test.sh <image> [port]}
port=${2:-8000}
engine=${CONTAINER_ENGINE:-docker}
expected=$(cat VERSION)
name="cociboard-smoke-$$"
volume="$name-data"
health=$(mktemp)

cleanup() {
    "$engine" rm -f "$name" >/dev/null 2>&1 || true
    "$engine" volume rm "$volume" >/dev/null 2>&1 || true
    rm -f "$health"
}
trap cleanup EXIT INT TERM

fail() {
    echo "$1" >&2
    "$engine" logs "$name" >&2 || true
    exit 1
}

"$engine" volume create "$volume" >/dev/null
"$engine" run -d --name "$name" -p "$port:8000" -v "$volume:/data" "$image" >/dev/null

ok=0
i=0
while [ "$i" -lt 30 ]; do
    if curl -fsS "http://127.0.0.1:$port/api/health" -o "$health" 2>/dev/null; then
        ok=1
        break
    fi
    i=$((i + 1))
    sleep 2
done
[ "$ok" = 1 ] || fail "The container did not become healthy within 60 s"

cat "$health"
echo
grep -q "\"version\": *\"$expected\"" "$health" ||
    fail "/api/health does not report version $expected"

code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/")
[ "$code" = 200 ] || fail "GET / returned $code, expected 200"

echo "Smoke test passed for $image (version $expected)"
