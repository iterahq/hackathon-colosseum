#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# THE WHOLE CAPTURE, AS ONE COMMAND, WITH NO HOST INPUTS.
#
# Builds the stamped bundle, serves it on loopback, runs the two deterministic
# Playwright projects against it, and copies the artifacts plus a digest report
# into $OUT_DIR.
#
# 🚫 WHAT IT DELIBERATELY DOES NOT NEED
# There is no credential here, and that is the design rather than an omission.
# The substrate is a stub Supabase origin that does not resolve, so nothing can
# authenticate and nothing can reach production. That is exactly why this can
# run on a schedule, in a container, on a machine nobody has provisioned: the
# repo's other Playwright cron (`e2e.yml`) is red for want of secrets, and this
# one cannot inherit that failure mode because it has no secrets to be missing.
#
# The ONE thing a build needs from outside is NODE_AUTH_TOKEN, for the private
# `@iterahq/activity-spec` on GitHub Packages — and it is needed at IMAGE BUILD
# time, not here. By the time this script runs, `node_modules` is already in the
# image and the token is gone with the build stage.
#
# Usage:
#   OUT_DIR=/out scripts/ux-capture/run-capture.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

OUT_DIR="${OUT_DIR:-/out}"
PORT="${PORT:-4189}"
SKIP_BUILD="${SKIP_BUILD:-0}"

cd "$(dirname "$0")/../.."
REPO_ROOT="$PWD"

echo "── ux-capture ─────────────────────────────────────────────────────────"
echo "repo    : $REPO_ROOT"
echo "out     : $OUT_DIR"
echo "node    : $(node --version)"
echo "chromium: $(node -e 'const{chromium}=require("playwright");console.log(chromium.executablePath())' 2>/dev/null || echo '(not resolvable)')"

if [ "$SKIP_BUILD" != "1" ]; then
  echo "── building the stamped bundle ────────────────────────────────────────"
  ITERA_SOURCE_STAMP=1 \
  VITE_SUPABASE_URL=http://stub.supabase.invalid \
  VITE_SUPABASE_ANON_KEY=stub-anon-key \
    npm run build
fi

# `--host 127.0.0.1` is not tidiness. `vite preview` binds 0.0.0.0 by default,
# and this preview contains the private repository layout in its `data-source`
# stamps — on a public host that would publish the source tree. Loopback only.
echo "── serving on 127.0.0.1:$PORT ─────────────────────────────────────────"
npx vite preview --port "$PORT" --strictPort --host 127.0.0.1 >"$REPO_ROOT/preview.log" 2>&1 &
PREVIEW_PID=$!
cleanup() { kill "$PREVIEW_PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
  sleep 1
done
if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "::error title=ux-capture::the preview never came up on 127.0.0.1:$PORT"
  cat "$REPO_ROOT/preview.log" || true
  exit 1
fi

# The suites open their own browser contexts, so the config's `webServer` is not
# wanted here — the server is already up and `reuseExistingServer` is false
# under CI, which would make Playwright start a second one and pay for a second
# `vite build`. `STAMP_BASE_URL` points both projects at the running preview and
# `CI=` unsets the CI flag for this one invocation only.
echo "── capture + manifest ─────────────────────────────────────────────────"
rm -rf "$REPO_ROOT/e2e/artifacts"
set +e
CI='' STAMP_BASE_URL="http://127.0.0.1:$PORT" \
  npx playwright test --config playwright.stamp.config.ts \
    --project capture --project manifest --reporter=list
SUITE_STATUS=$?
set -e

echo "── digests ────────────────────────────────────────────────────────────"
set +e
node scripts/ux-capture/digests.mjs --artifacts e2e/artifacts --check
DIGEST_STATUS=$?
set -e

echo "── collecting ─────────────────────────────────────────────────────────"
mkdir -p "$OUT_DIR"
cp -a "$REPO_ROOT/e2e/artifacts/." "$OUT_DIR/" 2>/dev/null || true
if [ -d "$REPO_ROOT/playwright-report" ]; then
  cp -a "$REPO_ROOT/playwright-report" "$OUT_DIR/"
fi
cp "$REPO_ROOT/e2e/support/capture-digests.json" "$OUT_DIR/capture-digests.recorded.json" 2>/dev/null || true
printf '{"suite_status":%d,"digest_status":%d}\n' "$SUITE_STATUS" "$DIGEST_STATUS" \
  > "$OUT_DIR/status.json"

echo "suite exit=$SUITE_STATUS  digest exit=$DIGEST_STATUS"

# The SUITE failing is a fault: the frozen manifest no longer describes the app,
# or the capture stopped being deterministic. The DIGEST differing is not
# necessarily a fault — it is the product, "something on screen changed". They
# are reported separately for exactly that reason, and the caller decides.
exit "$SUITE_STATUS"
