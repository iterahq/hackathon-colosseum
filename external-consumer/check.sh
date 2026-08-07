#!/usr/bin/env bash
#
# Pack `@iterahq/activities`, install THAT tarball into a project that is not
# this app, and render activities from fixture specs.
#
# The three properties this script exists to guarantee, each of which a plain
# `npm test` inside the monorepo silently loses:
#
#  1. **The artifact, not the source.** `npm pack` produces exactly what a
#     consumer would download. If `files` forgets `dist`, or `exports` points
#     somewhere that is not shipped, the install below fails — in the repo,
#     nothing would have noticed, because the resolver reads the source tree.
#  2. **A separate dependency tree.** `external-consumer/node_modules` is its
#     own. A phantom dependency — something the package imports but does not
#     declare, satisfied by the app's hoisted tree — cannot hide here.
#  3. **No workspace link.** `--install-links` forces npm to COPY the packed
#     package rather than symlink anything back into `packages/`, so nothing
#     in this run can reach the workspace source.
#
# Usage: bash external-consumer/check.sh   (from the repo root or anywhere)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$ROOT/external-consumer"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> building @iterahq/activities"
npm run build --prefix "$ROOT/packages/activities" >/dev/null

echo "==> packing the published artifact"
TARBALL_NAME="$(cd "$STAGE" && npm pack "$ROOT/packages/activities" --silent)"
TARBALL="$STAGE/$TARBALL_NAME"
test -f "$TARBALL" || { echo "npm pack produced nothing"; exit 1; }
echo "    $TARBALL_NAME ($(du -h "$TARBALL" | cut -f1))"

# What is INSIDE the tarball is part of the contract. `dist/index.js` missing
# here is the exact failure that only shows up at a consumer's install.
#
# The listing is taken ONCE into a variable rather than piped into `grep -q`:
# `grep -q` exits on the first match, `tar` takes SIGPIPE, and under
# `set -o pipefail` the whole pipeline reports failure — a green tarball would
# be reported as a missing file. Burned on the first run of this script.
MANIFEST="$(tar -tzf "$TARBALL")"
grep -qx 'package/dist/index.js' <<<"$MANIFEST" \
  || { echo "::error::the packed tarball has no dist/index.js"; exit 1; }
grep -qx 'package/dist/index.d.ts' <<<"$MANIFEST" \
  || { echo "::error::the packed tarball has no type declarations"; exit 1; }
# And what is NOT inside it matters too: shipping `src/` would let a consumer
# accidentally deep-import past the public barrel.
if grep -q '^package/src/' <<<"$MANIFEST"; then
  echo "::error::the packed tarball ships src/ — the barrel stops being the API"
  exit 1
fi

echo "==> installing it into a project that is not the app"
rm -rf "$HERE/node_modules" "$HERE/package-lock.json"
( cd "$HERE" && npm install "$TARBALL" --install-links --no-audit --no-fund --loglevel=error )

echo "==> proving nothing resolves back into the workspace"
test ! -L "$HERE/node_modules/@iterahq/activities" \
  || { echo "::error::@iterahq/activities is a symlink — the workspace leaked in"; exit 1; }

echo "==> rendering activities outside the Itera Player"
( cd "$HERE" && node run.mjs )
