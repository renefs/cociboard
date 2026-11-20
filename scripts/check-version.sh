#!/bin/sh
# Verifies that every file holding the release version equals VERSION (see AGENTS.md).
# Run from the repository root (make check-version). POSIX sh; needs node.
set -u

expected=$(cat VERSION)
fail=0

check() {
    echo "$1: $2"
    if [ "$2" != "$expected" ]; then
        echo "Version mismatch in $1: found '$2', expected '$expected'" >&2
        fail=1
    fi
}

echo "VERSION: $expected"
check backend/pyproject.toml \
    "$(sed -n 's/^version = "\(.*\)"/\1/p' backend/pyproject.toml | head -1)"
check backend/src/cociboard/__init__.py \
    "$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/src/cociboard/__init__.py)"
check frontend/package.json \
    "$(node -p "require('./frontend/package.json').version")"
check "frontend/package-lock.json (version)" \
    "$(node -p "require('./frontend/package-lock.json').version")"
check "frontend/package-lock.json (packages[\"\"])" \
    "$(node -p "require('./frontend/package-lock.json').packages[''].version")"
check "backend/uv.lock (cociboard)" \
    "$(awk '/^name = "cociboard"$/ {f=1; next} f && /^version = / {gsub(/version = |"/, ""); print; exit}' backend/uv.lock)"
check "README.md (Current version)" \
    "$(sed -n 's/^Current version: \*\*\([^*]*\)\*\*.*/\1/p' README.md | head -1)"

exit "$fail"
