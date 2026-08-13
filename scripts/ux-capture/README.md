# `scripts/ux-capture` — the observed map of this app

P7 and P8 of plan
[`20260812-ux-map-observed-reality-lens`](https://plans.devfellowship.com/20260812-ux-map-observed-reality-lens).

## The shape, in one line

**The AI is a compiler, not a runtime.** It runs rarely, by hand; its output is
committed data; and the thing that runs on every change makes no model call.

```
prepass.mjs        deterministic, no model      →  which routes render, which bounce
   ↓
opencode + MCP     ONE bounded session, rare    →  candidate STATES behind interaction
   ↓
verify-states.mjs  deterministic                →  only what reproduces is promoted
   ↓
e2e/support/capture-manifest.json               ←  THE COMMITTED ARTIFACT
   ↓
capture-manifest.spec.ts   every PR, no model   →  the map still describes the app
run-capture.sh in a container, weekly           →  the observed artifact, off-host
```

If you find yourself re-running the model to answer a question, the manifest is
missing a field. Add the field.

## The files

| file | what it does | needs a model? |
|---|---|---|
| `prepass.mjs` | visits all 31 declared routes, records render-vs-redirect, testids, region counts | **no** |
| `verify-states.mjs` | replays each claimed state from a FRESH context, promotes only what reproduces | **no** |
| `digests.mjs` | records / compares `regions.json` + `screenshot.png` digests, keyed by Chromium revision | **no** |
| `run-capture.sh` | the whole capture as one command, for the container | **no** |

The model appears exactly once, and not in this directory: it is invoked by hand
through the `ux-capture-explore` skill in `devfellowship/dfl-harness`.

## Re-running the deterministic parts

```bash
# 1. the stamped, hermetic preview
ITERA_SOURCE_STAMP=1 VITE_SUPABASE_URL=http://stub.supabase.invalid \
  VITE_SUPABASE_ANON_KEY=stub-anon-key npm run build
npx vite preview --port 4189 --strictPort --host 127.0.0.1 &

# 2. reachability, no model
npm run ux-capture:prepass -- prepass.json

# 3. the frozen map, asserted
npm run e2e:manifest

# 4. digests
npm run ux-capture:digests -- --check     # or --write to refresh the record
```

Or the whole thing at once, the way the container runs it:

```bash
OUT_DIR=/tmp/ux-capture npm run ux-capture
```

## When the manifest goes red

**Update the data. Do not re-explore.** Three cases:

1. **A reachable route stopped proving itself** — its marker moved. Fix
   `marker` in `capture-manifest.json`.
2. **A gated route stopped redirecting** — 🚨 read this as a **security**
   finding first. `RequireAuth` redirects silently, so nothing else in this
   repository would have noticed.
3. **A state stopped replaying** — the form changed. Fix `steps` / `proof`, then
   re-run `npm run ux-capture:verify -- --candidates <file> --write`.

## What the numbers are

Measured 2026-08-13, all of it re-derivable with the commands above:

- **31** declared routes · **7** render their own content with no session ·
  **24** silently redirect to `/login`
- **5** interaction-reachable states, from **6** claimed by the model; the two
  rejections and the one duplicate are in
  `e2e/support/capture-manifest.REJECTED.md`
- **2 frames** to settle, every screen, every run — 56 measurements across 4
  runs. See `settleUntilStable` in `e2e/support/captureRegions.ts`
- **byte-identical across three environments**, not two: a Debian 11 host, an
  Ubuntu 24.04 container (17 of 17 pairs), and — on the first scheduled workflow
  run — a **`dfl-runner` VPS**, a different physical machine, where all 8
  recorded digests still matched (`pixels moved: 0`). The pixels follow the
  **Chromium revision**, not the host. Mechanism and limits: the header of
  `digests.mjs`.

  ⚠️ What that does *not* license: every **other** key is still unmeasured — a
  Chromium bump, an arm64 runner. That is why the record stays keyed and why a
  key mismatch records rather than fails. Each run writes its `host` block into
  `status.json` so a future mismatch is diagnosable from the artifact.
