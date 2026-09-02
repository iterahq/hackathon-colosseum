#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# THE WHOLE CAPTURE, AS ONE COMMAND, WITH NO HOST INPUTS.
#
# Builds the stamped bundle, serves it on loopback, runs the three deterministic
# Playwright projects against it — `capture`, `manifest` and `manifest-mobile` —
# and copies the artifacts plus a digest report into $OUT_DIR.
#
# 📱 The mobile pass is a REPLAY, not a second exploration: the same
# `e2e/support/capture-manifest.json`, the same markers, the same states, in a
# 390x844 `isMobile` context. No model runs here and none is needed — the
# 2026-09-02 prepass at 390 flagged zero of the 31 routes.
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

# WHO RAN THIS. Recorded because `capture-digests.json` is keyed by
# `chromium` + `arch`, and the day a pixel digest moves the FIRST question is
# "did the machine change?" — a question that is unanswerable after the fact
# unless the answer was written down at the time.
#
# It is not decoration: the cross-host result this whole design rests on
# (8 of 8 pairs identical between a Debian 11 host, an Ubuntu 24.04 container
# and a dfl-runner VPS) is only readable as evidence because the hosts are
# distinguishable. A future mismatch on an unmeasured key — a Chromium bump,
# an arm64 runner — should be diagnosable from the artifact alone.
CPU_MODEL="$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//' || echo unknown)"
# shellcheck disable=SC1091  # /etc/os-release is provided by the OS, not the repo
OS_NAME="$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo unknown)"
echo "os      : $OS_NAME"
echo "cpu     : $CPU_MODEL ($(nproc 2>/dev/null || echo '?') cores)"

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
# 📱 THREE projects, ONE invocation. `manifest-mobile` replays the SAME frozen
# manifest at 390x844 (ADR-6 / plan
# `20260902-ux-paths-responsive-mobile-capture`), and it must run in this call
# and not a second one: `webServer` is bypassed here (the preview is already
# up), but a separate `playwright test` would still re-launch Chromium and
# re-walk the tree for no reason. The pairs it writes are suffixed `@390x844`
# per ADR-3, so the two viewports cannot overwrite each other.
echo "── capture + manifest (desktop and mobile) ────────────────────────────"
rm -rf "$REPO_ROOT/e2e/artifacts"
set +e
CI='' STAMP_BASE_URL="http://127.0.0.1:$PORT" \
  npx playwright test --config playwright.stamp.config.ts \
    --project capture --project manifest --project manifest-mobile --reporter=list
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
# `status.json` carries the two verdicts AND the machine that produced them, so
# the artifact answers "what changed" and "where did it run" without needing the
# job log, which expires long before a digest question gets asked.
python3 - "$OUT_DIR/status.json" "$SUITE_STATUS" "$DIGEST_STATUS" "$OS_NAME" "$CPU_MODEL" <<'PYEOF'
import json, os, platform, sys
out, suite, digest, os_name, cpu = sys.argv[1:6]
json.dump(
    {
        "suite_status": int(suite),
        "digest_status": int(digest),
        "host": {
            "os": os_name,
            "cpu": cpu,
            "cores": os.cpu_count(),
            "arch": platform.machine(),
        },
    },
    open(out, "w"),
    indent=2,
)
PYEOF

echo "suite exit=$SUITE_STATUS  digest exit=$DIGEST_STATUS"

# The SUITE failing is a fault: the frozen manifest no longer describes the app,
# or the capture stopped being deterministic. The DIGEST differing is not
# necessarily a fault — it is the product, "something on screen changed". They
# are reported separately for exactly that reason, and the caller decides.
exit "$SUITE_STATUS"
