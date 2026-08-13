# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# THE PORTABLE CAPTURE — P8 of plan `20260812-ux-map-observed-reality-lens`.
#
# One image that produces the observed artifact for `app.iterahq.dev` on any
# x64 Docker host, with NO host credentials, NO `/root/.claude`, and no reach
# into production.
#
# ═══════════════════════════════════════════════════════════════════════════
# WHY THE BASE IMAGE IS PINNED BY DIGEST AND NOT BY TAG
# ═══════════════════════════════════════════════════════════════════════════
# Measured 2026-08-13: the capture is byte-identical between this container
# (Ubuntu 24.04, 50 system fonts) and the Debian 11 host it was developed on
# (135 system fonts) — 17 of 17 screens, PNG and `regions.json` both. The
# mechanism is that Chrome-for-Testing bundles its own Skia and FreeType, the
# app's fonts are self-hosted woff2 the PAGE loads, and `CAPTURE_LAUNCH_ARGS`
# removes the GPU, the subpixel text path and the CPU-feature-dependent Skia
# paths.
#
# So the pixels are a function of the CHROMIUM REVISION, not of the host distro.
# That makes the browser version the thing worth pinning hard: `v1.61.0-noble`
# is a mutable tag whose contents can be rebuilt with a different Chromium, and
# the day that happens every recorded digest would move at once with no commit
# to blame. The digest below is that tag as resolved on 2026-08-13.
#
# ⚠️ Bump it deliberately, together with `@playwright/test` in `package.json`,
# and refresh `e2e/support/capture-digests.json` in the SAME pull request — the
# record is keyed by Chromium revision precisely so a bump reads as a bump
# rather than as a regression.
#
# ═══════════════════════════════════════════════════════════════════════════
# WHY THE IMAGE CARRIES THE BROWSER AND NOT `playwright install`
# ═══════════════════════════════════════════════════════════════════════════
# `playwright install --with-deps` apt-installs browser dependencies at RUN
# time. On the self-hosted runners that cost recurs on every job (the runner
# containers recycle every 2h) and it is a documented source of disk pressure —
# see the capacity note in `.github/workflows/e2e.yml`. Baking it in trades
# image size for a run that touches no package mirror at all, which is also what
# makes the container work on a machine with no network egress to apt.
# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.61.0-noble@sha256:57b65fdc9ceabe0ef613124c7bbe2babcf9362c4d85e382fe3b03604e84b428a

WORKDIR /app

# ⚠️ The token is a BuildKit SECRET, never an ARG. An ARG value is recorded in
# `docker history`, so it would ship the credential inside the image — the same
# reasoning as the app `Dockerfile`, and the same failure it already documents:
# without `required=true` a missing secret mounts an EMPTY file, npm sends an
# empty bearer, and the build dies on an opaque 401 from the registry rather
# than on a message naming the secret.
#
# In GitHub Actions this is `secrets.GITHUB_TOKEN` with `packages: read`, which
# works because the package and the workflow are both in `iterahq`. Nothing
# longer-lived is needed, and nothing longer-lived should be used.
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,required=true \
    NODE_AUTH_TOKEN="$(cat /run/secrets/NODE_AUTH_TOKEN)" \
    npm ci

COPY . .

# The capture needs the SOURCE TREE at run time, not only the bundle: every
# `data-source` stamp is resolved against the file it names, and
# `capture-regions.spec.ts` asserts that the named line really opens the tag it
# claims. An image that shipped only `dist/` could produce a map and could not
# check a single entry of it.

ENV OUT_DIR=/out \
    PORT=4189 \
    CI=1
VOLUME ["/out"]

# No shell form, so a signal reaches the script and the trap that stops the
# preview actually runs.
ENTRYPOINT ["bash", "scripts/ux-capture/run-capture.sh"]
