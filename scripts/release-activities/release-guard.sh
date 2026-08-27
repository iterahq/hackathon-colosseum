#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# release-guard.sh — the ONE copy of "is this version already in the registry?"
#
# WHY THIS FILE EXISTS AT ALL
#
# The detection used to live inline in `.github/workflows/release-activities.yml`
# and it was WRONG for months without anybody noticing. It probed
# `GET https://npm.pkg.github.com/@iterahq/activities/<version>` and compared the
# status to 200. GitHub Packages serves no per-version GET route — that URL
# answers 405 whether the version exists or not — so the test could never be
# true. The guard reported "safe to publish" on every run it ever made, and
# `npm publish` then died with a generic 409.
#
# PR #432 fixed the probe (read the packument root, look the version up in its
# `versions` map). It did NOT fix the reason the bug survived: the logic ran
# exactly once per release, on the one branch that a release exercises, with no
# way to know it was broken until somebody tried to ship.
#
# So the logic moved here, and it is now called from THREE places:
#
#   1. `self-check` — runs on EVERY trigger of `release-activities.yml`, before
#      the real guard, against a sentinel version that cannot exist and against
#      the registry's own `dist-tags.latest`. Both directions get proven on every
#      run. A detection that always says "absent" (the 2026-08 bug) and a
#      detection that always says "published" both go red immediately.
#   2. `decide` — the real guard. Same code path, real version, real event.
#   3. `inspect` — the raw observation, for a caller that has its OWN policy.
#      `.github/workflows/registry-drift.yml` is that caller: it asks "is what
#      the registry TAGS AS LATEST the same string main declares?", which is a
#      different question from "may I publish?". It used to answer that question
#      with a second, hand-rolled fetch-and-parse of the same packument. Two
#      copies of this logic is exactly how the 2026-08 bug stayed invisible for
#      months, so the second copy is gone and the monitor reads through here.
#
# A self-check that tested a COPY of the logic would prove nothing. That is the
# load-bearing property of this file: there is one copy.
#
# The split is deliberate: `probe` is the shared OBSERVATION (fetch, parse,
# refuse to guess). `decide` and the drift monitor are two separate POLICIES
# over it. A 404, for one example, means "first release, go ahead" to the guard
# and "the worst kind of drift" to the monitor. Sharing the observation is the
# point; sharing the policy would be wrong.
#
# The stubbed-curl matrix that proves the branches lives next to it, in
# `release-guard.test.ts`, and runs in the normal `npm test` unit job.
#
# ─────────────────────────────────────────────────────────────────────────────
# USAGE
#
#   release-guard.sh decide <version> <event-name>
#   release-guard.sh inspect <version>
#   release-guard.sh self-check
#
# `decide` writes key=value lines to stdout:
#
#   version=<v>            the version it was asked about
#   packument_http=<code>  what the registry answered for the packument root
#   latest=<v>             dist-tags.latest, or empty when there is none
#   already_published=yes|no
#   should_publish=true|false   (only on exit 0)
#   reason=<slug>               (only on a non-zero exit)
#
# `inspect` writes the same observation WITHOUT the publish policy, plus the
# full version list, and never has an opinion about what to do next:
#
#   version=<v>
#   packument_http=<code>
#   latest=<v>             dist-tags.latest, or empty when there is none
#   already_published=yes|no
#   versions=<a,b,c>       every published version, comma-joined; empty on 404
#   reason=<slug>          (only on a non-zero exit)
#
# The human-readable cause of an exit 2 goes to STDERR on both paths, so a
# caller can quote it in an alert.
#
# EXIT CODES — deliberately distinct:
#
#   0  decided (`decide`), or the registry was read and can be trusted
#      (`inspect`).
#   2  INDETERMINATE. The packument could not be read or could not be trusted.
#      This is a HARD ERROR on EVERY path. An unreadable registry must never be
#      read as "free to publish" (push), nor as "already there" (dispatch), nor
#      as "main and the registry agree" (the drift monitor).
#   3  The version is already published AND a human asked for this run
#      (`workflow_dispatch`). `decide` only.
#   64 usage error.
#
# GitHub-specific output (::error::, ::notice::, the step summary) stays in the
# workflow. This script speaks plain key=value so the test harness can read it.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REGISTRY="${REGISTRY:-https://npm.pkg.github.com}"
PACKAGE="${PACKAGE:-@iterahq/activities}"

# A version string npm accepts but that no release can ever mint: the prerelease
# tag is literal prose. Used by `self-check` as the negative control.
SENTINEL_VERSION="${SENTINEL_VERSION:-0.0.0-does-not-exist}"

log() { printf '%s\n' "$*" >&2; }

# ── fetch_packument <outfile> ────────────────────────────────────────────────
# Echoes the HTTP status. `000` when curl itself failed (DNS, TLS, refused).
fetch_packument() {
  local out="$1" code
  code=$(curl -sS --max-time "${PACKUMENT_TIMEOUT:-60}" -o "$out" -w '%{http_code}' \
    -H "Authorization: Bearer ${NODE_AUTH_TOKEN:-}" \
    "$REGISTRY/$PACKAGE") || code="000"
  [ -n "$code" ] || code="000"
  printf '%s' "$code"
}

# ── read_packument <file> <version> ──────────────────────────────────────────
# Prints three lines: `exists=yes|no`, `latest=<v>` and `versions=<a,b,c>`.
# Exits non-zero when the document cannot be trusted: not JSON, or no `versions`
# OBJECT. A 200 response without a `versions` map is not an empty package — it
# is a document we do not understand, and guessing either way is the failure
# mode this whole file is about. `versions` that is an ARRAY or a STRING is
# rejected for the same reason: `Object.keys` answers happily for both and hands
# back list indices as if they were version numbers.
read_packument() {
  node -e '
    const fs = require("fs");
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    } catch (err) {
      console.error("packument is not valid JSON: " + err.message);
      process.exit(1);
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      console.error("packument is not a JSON object");
      process.exit(1);
    }
    const versions = doc.versions;
    if (!versions || typeof versions !== "object" || Array.isArray(versions)) {
      console.error("packument has no `versions` object");
      process.exit(1);
    }
    const wanted = process.argv[2];
    const exists = Object.prototype.hasOwnProperty.call(versions, wanted);
    const latest = (doc["dist-tags"] && typeof doc["dist-tags"].latest === "string")
      ? doc["dist-tags"].latest
      : "";
    const all = Object.keys(versions).join(",");
    process.stdout.write(
      "exists=" + (exists ? "yes" : "no") +
      "\nlatest=" + latest +
      "\nversions=" + all + "\n"
    );
  ' "$1" "$2"
}

# ── probe <version> ──────────────────────────────────────────────────────────
# THE ONE REGISTRY READ. Everything else in this file, and the drift monitor,
# goes through here. It fetches the packument root, parses it, and sets:
#
#   PROBE_HTTP      the status code; `000` when curl itself failed
#   PROBE_EXISTS    yes|no — is <version> in the `versions` map?
#   PROBE_LATEST    dist-tags.latest, or empty when there is none
#   PROBE_VERSIONS  every published version, comma-joined; empty on 404
#   PROBE_ERROR     why the read cannot be trusted (only when it returns 2)
#
# Returns 0 when the registry ANSWERED and the answer can be trusted, 2 when it
# cannot. It never decides what the caller should do about it.
probe() {
  local version="$1" tmp errfile parsed
  PROBE_HTTP=""; PROBE_EXISTS=""; PROBE_LATEST=""; PROBE_VERSIONS=""; PROBE_ERROR=""

  tmp="$(mktemp)"
  errfile="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp' '$errfile'" RETURN

  PROBE_HTTP="$(fetch_packument "$tmp")"

  case "$PROBE_HTTP" in
    200)
      if ! parsed="$(read_packument "$tmp" "$version" 2>"$errfile")"; then
        PROBE_ERROR="the registry answered 200 but the body could not be trusted: $(cat "$errfile" 2>/dev/null)"
        return 2
      fi
      PROBE_EXISTS="$(printf '%s\n' "$parsed" | sed -n 's/^exists=//p')"
      PROBE_LATEST="$(printf '%s\n' "$parsed" | sed -n 's/^latest=//p')"
      PROBE_VERSIONS="$(printf '%s\n' "$parsed" | sed -n 's/^versions=//p')"
      ;;
    404)
      # Nothing is published under this name. The registry ANSWERED, so this is
      # a trustworthy observation — it is the one status that is safe to read as
      # "absent". What it MEANS is the caller's business: a first release to
      # `decide`, and the worst kind of drift to the monitor.
      PROBE_EXISTS="no"
      PROBE_LATEST=""
      PROBE_VERSIONS=""
      ;;
    *)
      PROBE_ERROR="could not read the $PACKAGE packument (http=$PROBE_HTTP)"
      return 2
      ;;
  esac

  return 0
}

# ── decide <version> <event-name> ────────────────────────────────────────────
# The PUBLISH policy over `probe`.
decide() {
  local version="$1" event="$2"

  printf 'version=%s\n' "$version"

  probe "$version"
  local rc=$?

  printf 'packument_http=%s\n' "$PROBE_HTTP"

  if [ "$rc" -ne 0 ]; then
    printf 'reason=unreadable-packument\n'
    log "$PROBE_ERROR — refusing to guess whether $version exists"
    return 2
  fi

  printf 'latest=%s\n' "$PROBE_LATEST"
  printf 'already_published=%s\n' "$PROBE_EXISTS"

  if [ "$PROBE_EXISTS" = "no" ]; then
    printf 'should_publish=true\n'
    return 0
  fi

  # From here on the version IS in the registry. What that MEANS depends on who
  # asked for the run.
  if [ "$event" = "workflow_dispatch" ]; then
    # A human asked to publish, on purpose, a version that is already there.
    printf 'reason=dispatch-on-existing-version\n'
    return 3
  fi

  # A merge to main. Most merges touch the package without bumping the version,
  # so this is the NORMAL case and it must not go red.
  printf 'should_publish=false\n'
  return 0
}

# ── inspect <version> ────────────────────────────────────────────────────────
# `probe` with no policy at all, for a caller that has its own. Same read, same
# refusal to guess, same exit 2 — and the full version list, which `decide` has
# no use for but the drift monitor prints in its alert.
inspect() {
  local version="$1"

  printf 'version=%s\n' "$version"

  probe "$version"
  local rc=$?

  printf 'packument_http=%s\n' "$PROBE_HTTP"

  if [ "$rc" -ne 0 ]; then
    printf 'reason=unreadable-packument\n'
    log "$PROBE_ERROR"
    return 2
  fi

  printf 'latest=%s\n' "$PROBE_LATEST"
  printf 'already_published=%s\n' "$PROBE_EXISTS"
  printf 'versions=%s\n' "$PROBE_VERSIONS"
  return 0
}

# ── self-check ───────────────────────────────────────────────────────────────
# Runs the REAL detection against the REAL registry, on versions whose answer is
# known in advance. Three assertions, and each one catches a different way the
# detection can rot:
#
#   1. sentinel + push  -> should_publish=true
#      This is the branch that actually releases. Before this step existed it
#      had never run live: every real run since the fix hit an already-published
#      version. If the packument shape changes for an absent version, this goes
#      red on the next merge instead of at release time.
#   2. latest + push    -> should_publish=false
#      The inverse. The 2026-08 bug reported "absent" for EVERY version; a
#      one-sided check for "absent" would have passed happily next to it.
#   3. latest + dispatch -> exit 3
#      The hard error a human gets for asking to republish. Same code path.
#
# When the packument answers 404 there is no `latest` yet (first release), so 2
# and 3 are skipped and said to be skipped.
self_check() {
  local out rc latest failures=0

  echo "--- self-check 1/3: a version that cannot exist must read as ABSENT ---"
  out="$(decide "$SENTINEL_VERSION" "push")"
  rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -ne 0 ]; then
    echo "SELF-CHECK FAILED: detection could not reach a verdict (exit $rc)"
    return 1
  fi
  if ! printf '%s\n' "$out" | grep -qx 'should_publish=true'; then
    echo "SELF-CHECK FAILED: $SENTINEL_VERSION was reported as already published."
    echo "The version-existence detection is broken. It would refuse a real release."
    return 1
  fi
  echo "ok: $SENTINEL_VERSION reads as absent, should_publish=true"

  latest="$(printf '%s\n' "$out" | sed -n 's/^latest=//p')"
  if [ -z "$latest" ]; then
    echo "--- self-check 2/3 and 3/3: SKIPPED, the registry has no dist-tags.latest yet (first release) ---"
    return 0
  fi

  echo "--- self-check 2/3: dist-tags.latest ($latest) must read as PUBLISHED ---"
  out="$(decide "$latest" "push")"
  rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -ne 0 ]; then
    echo "SELF-CHECK FAILED: detection could not reach a verdict for $latest (exit $rc)"
    failures=1
  elif ! printf '%s\n' "$out" | grep -qx 'already_published=yes'; then
    echo "SELF-CHECK FAILED: $latest is the registry's own latest tag and the detection"
    echo "did not find it. This is the 2026-08 bug: the guard says 'absent' for everything."
    failures=1
  else
    echo "ok: $latest reads as published, should_publish=false on the push path"
  fi

  echo "--- self-check 3/3: dist-tags.latest ($latest) on the dispatch path must HARD ERROR ---"
  out="$(decide "$latest" "workflow_dispatch")"
  rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -ne 3 ]; then
    echo "SELF-CHECK FAILED: a dispatch on an already-published version exited $rc, expected 3."
    echo "A human asking to republish would not be told."
    failures=1
  else
    echo "ok: dispatch on $latest exits 3 with reason=dispatch-on-existing-version"
  fi

  return "$failures"
}

main() {
  case "${1:-}" in
    decide)
      if [ "$#" -ne 3 ]; then
        log "usage: $0 decide <version> <event-name>"
        return 64
      fi
      decide "$2" "$3"
      ;;
    inspect)
      if [ "$#" -ne 2 ]; then
        log "usage: $0 inspect <version>"
        return 64
      fi
      inspect "$2"
      ;;
    self-check)
      self_check
      ;;
    *)
      log "usage: $0 {decide <version> <event-name>|inspect <version>|self-check}"
      return 64
      ;;
  esac
}

main "$@"
