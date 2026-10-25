# ADR-0011: Prebuilt image on the GitHub Container Registry

## Status
Accepted

## Context
ADR-0010 deploys by building the image on the host. On a NAS that takes several minutes
(npm install and the frontend build) and needs the full source tree on the device. Its
Consequences left publishing a prebuilt image for later. The repository is private for
now and the image must stay private too.

## Decision
- **GitHub Actions publishes to ghcr.io.** `.github/workflows/docker-publish.yml` runs on
  pushes to `main`, on version tags `vX.Y.Z` and by hand. It logs in with the workflow's
  `GITHUB_TOKEN` (`packages: write`), so no stored secret is needed.
- **Multi-arch with QEMU.** Buildx builds `linux/amd64` and `linux/arm64` on one
  `ubuntu-latest` runner. The frontend stage uses `--platform=$BUILDPLATFORM`: its output
  is static files, so only the Python stage runs under emulation. Layers are cached in
  the GitHub Actions cache.
- **Tags.** `docker/metadata-action` derives them: a version tag gives `X.Y.Z`, `X.Y`
  and `latest`; a push to `main` gives `main`; every build gets `sha-<commit>`. `latest`
  therefore always means the last release.
- **Private by inheritance.** A package pushed from a workflow with `GITHUB_TOKEN` is
  linked to its repository and takes its visibility, so it is private while the
  repository is. Hosts log in with a classic personal access token limited to
  `read:packages`.
- **Separate compose file.** `docker-compose.ghcr.yml` has `image:` and no `build:`, with
  the same settings and `./data` bind mount as `docker-compose.yml`, plus
  `COCIBOARD_TAG`. The source-build file stays unchanged.

## Consequences
- A NAS only needs one compose file, a login and `docker compose pull`; updates are a
  pull instead of a rebuild.
- Each host needs a personal access token. Making the package public later is a
  visibility switch on GitHub plus dropping the login step from the README.
- The emulated arm64 Python stage makes CI builds slower than native ones; acceptable
  because it only installs prebuilt wheels.
- The workflow does not run `make check`; it remains the gate before tagging a release.
- The owner (`renefs`) is written in `docker-compose.ghcr.yml` and the README; a fork
  must change it.
