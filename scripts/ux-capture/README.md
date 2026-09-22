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
| `prepass.mjs` | visits all 31 declared routes, records render-vs-redirect, testids, region counts. `--viewport` | **no** |
| `verify-states.mjs` | replays each claimed state from a FRESH context, promotes only what reproduces. `--viewport` | **no** |
| `digests.mjs` | records / compares `regions.json` + `screenshot.png` digests, keyed by Chromium revision and by viewport | **no** |
| `run-capture.sh` | the whole capture as one command, for the container | **no** |
| `publish-capture.mjs` | uploads the pairs to media and writes `engineering.ux_map_*`. `--viewport` | **no** |
| `emit-observed-flows.ts` | the observed flows document, with the `screenshots[]` entry for one viewport | **no** |
| `viewports.ts` | the viewport vocabulary for the two scripts that run with NO `node_modules` | **no** |

## 📱 The second viewport

Plan
[`20260902-ux-paths-responsive-mobile-capture`](https://plans.devfellowship.com/20260902-ux-paths-responsive-mobile-capture),
task T2.

Every screen is captured twice: at `1280x800` and at `390x844`. The mobile pass
is a **replay**, not a second exploration. It reads the same
`capture-manifest.json`, uses the same markers and the same states, and runs
them in the mobile capture context — `isMobile: true`, `hasTouch: true`,
`deviceScaleFactor: 1` (ADR-6). Nothing in the frozen map is coordinate-based,
so nothing in it depends on the width.

That is a claim, and it was measured before it was believed. The 390 prepass on
2026-09-02 flagged **zero of the 31 routes**: same reachability, same landing
path, same visible stamped-region count, same `data-testid` set, same `h1`. So
`marker_by_viewport` and `min_regions_by_viewport` exist in the manifest and are
**empty**.

⚠️ Read that emptiness honestly. *"Every flagged route has a committed
override"* is true **by construction** while the flagged set is empty. The
assertion that is not vacuous is the marker **uniqueness** one in
`e2e/capture-manifest.spec.ts`: at every viewport, each reachable route's marker
must match its own route and **no other** reachable route.

Re-measured 2026-09-22 (T5): **2 of 31** flagged, `signup` and `subscribe`
(which lands on `/signup`), on visible region count only. Cause:
`SubscriptionIncludesPanel` swaps the desktop side panel for a compact list
below `lg`. Marker and `min_regions` still hold, so no override is committed.

### Mobile-only states (T5)

`e2e/support/capture-candidates.mobile.json` holds every candidate state that
exists only at 390: each `SidebarContract.toggle` passed in `e2e/*.spec.ts`,
the prepass delta, and each interactive `lg:hidden` / `sm:hidden` branch. They
were replayed with `verify-states.mjs --viewport mobile`; the model session
was not needed (0 of 60 calls). None is promoted today, because every
mobile-only interaction sits behind a session and the substrate is signed
out. The reasons are in `capture-manifest.REJECTED.md`, and
`capture-manifest.spec.ts` fails if a candidate is in neither `states[]` nor
that file, or if a new `SidebarContract.toggle` has no candidate.

| thing | where it is decided |
|---|---|
| the sizes, `isMobile`, `hasTouch`, the launch flags | `@devfellowship/ux-paths-capture` ≥ 0.3.0 — one place, fleet-wide |
| which viewports this app replays | `viewports[]` in `e2e/support/capture-manifest.json` |
| which screens each viewport photographs | `viewports[].capture_routes` (same file) |
| which directory each published screen comes from | `published-screens.json` (`screens`, `screens_by_viewport`) |
| where the row lands | the `viewport` COLUMN on `engineering.ux_map_captures` (ADR-8), never a `<role>@mobile` suffix |

Output directories are **flat and suffixed** (ADR-3): `manifest/<id>` for the
default viewport, `manifest/<id>@390x844` for the rest. The file names inside
stay `screenshot.png` and `regions.json`, always, and `regions.json` records the
true viewport — so a pair is self-describing even if it is moved.

**A pixel difference at 390 is RECORDED and does not fail `digests.mjs
--check`** (ADR-7). The 7 launch flags were tuned at 1280 and rasterisation at
another width has not yet crossed a host boundary the way the desktop key has. A
**layout** difference at 390 still counts: `regions.json` carries no
rasterisation, so it is the half that can answer *did the mobile layout move*.

⚠️ Two scripts — `publish-capture.mjs` and `emit-observed-flows.ts` — run on the
CI runner with **no `node_modules`**, so they cannot import the package. They
read `viewports.ts` instead, which restates only the sizes and the two derived
strings. `viewports.test.ts` asserts every value in it against the package, in
`npm test`, where the package IS installed.

The model appears exactly once, and not in this directory: it is invoked by hand
through the `ux-capture-explore` skill in `devfellowship/dfl-harness`.

## Re-running the deterministic parts

```bash
# 1. the stamped, hermetic preview
ITERA_SOURCE_STAMP=1 VITE_SUPABASE_URL=http://stub.supabase.invalid \
  VITE_SUPABASE_ANON_KEY=stub-anon-key npm run build
npx vite preview --port 4189 --strictPort --host 127.0.0.1 &

# 2. reachability, no model — once per viewport, then DIFF the two files
npm run ux-capture:prepass -- prepass.desktop.json
npm run ux-capture:prepass -- --viewport mobile prepass.mobile.json

# 3. the frozen map, asserted — at both viewports
npm run e2e:manifest
npm run e2e:manifest:mobile

# 4. digests
npm run ux-capture:digests -- --check     # or --write to refresh the record
```

⚠️ In CI, `npm run e2e:stamp` runs every project in ONE invocation and that is
deliberate: `webServer` does a full `vite build` and `reuseExistingServer` is
false under `CI`, so two `--project` calls would build this tree twice. The two
narrowed scripts above are for LOCAL iteration, where the server is reused.

Publishing is also once per viewport:

```bash
node scripts/ux-capture/publish-capture.mjs --out capture-out --dry-run
node scripts/ux-capture/publish-capture.mjs --out capture-out --viewport mobile --dry-run
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

## Where a run GOES — `publish-capture.mjs`

A capture that nobody publishes is a capture nobody can ask a question of.
Until 2026-08-13 the weekly workflow's only output was a GitHub run artefact
with 30-day retention: it never uploaded to media and never wrote a row, so
every row in the production index had been put there by hand from a developer
host, and a green weekly run fed nothing.

```bash
OUT_DIR=/tmp/ux-capture npm run ux-capture        # the capture
node scripts/ux-capture/publish-capture.mjs \
  --out /tmp/ux-capture --commit-sha "$(git rev-parse HEAD)"
```

It uploads each `screenshot.png` + `regions.json` to media, hands those URLs to
`emit-observed-flows.ts` — the same emitter the authenticated run uses — uploads
the resulting document, and writes one capture through
`engineering.index_ux_map_capture`. `--dry-run` needs no credential and prints
what would be sent.

Credentials come from the environment and nothing else:
`DFL_SUPABASE_ANON_KEY` plus either `DFL_SUPABASE_USER_JWT` or
`DFL_CAPTURE_USERNAME` / `DFL_CAPTURE_PASSWORD`. The RPC takes the writer from
`auth.uid()` and admits DFL members (IAM level ≥ 50). **There is no
`service_role` path and there must not be one** — the `dfl-schema` migration
that created the function removed that requirement on purpose.

### What it will and will not claim

- **Coverage is 2 of 31, and it is published as 2 of 31.** This substrate is
  signed out. The mapping from artefact directory to declared screen id is
  DATA — `published-screens.json` — and the script refuses to guess it: a
  rename on either side goes red with both names printed, rather than
  publishing a row with a null screenshot and calling it coverage.
- **The role is `anonymous-hermetic`, not `anonymous`.** The lens reads *the
  newest capture per app and role*, and a signed-out capture of the LIVE
  substrate already exists under `anonymous` with wider coverage. One role for
  both substrates would let the weekly cron overwrite the richer capture every
  Monday.
- ⚠️ **A run of an unchanged application still writes a new capture row.** The
  observed document embeds each screenshot's media URL, an upload mints a fresh
  media id every time, and the document's digest is the version key (ADR-3). The
  per-screen `screenshot_digest` is computed from the local bytes and does NOT
  drift, so *which screens changed* stays correct — it is only the row count
  that is generous. Reusing a previous upload's URL when the image digest is
  unchanged would fix it, and is not done yet.

---

## The AUTHENTICATED run — `capture-live.ts` + `emit-observed-flows.ts`

Everything above is **hermetic on purpose**: the substrate is a stub Supabase
origin that does not resolve, so the job needs no credential and can run
anywhere. The price is stated in its own numbers — *7 routes render their own
content with no session · 24 silently redirect to `/login`*. That is an honest
map of an application nobody is signed in to, and a designer cannot use it,
because 24 of the 31 screens are the product.

These two scripts are the other half. Same harness, same `captureScreen()`, same
determinism settings — a real session instead of a stub.

| | |
|---|---|
| `capture-live.ts` | signs in, walks the declared screens, writes the pairs and a verdict per screen |
| `emit-observed-flows.ts` | turns those pairs plus their upload URLs into the **observed** flows document |

Measured 2026-08-13 against the real ITERA project: **26 of 31** declared screens
as `tenant_admin`, plus **7** signed-out screens in the same run.

### ⚠️ The deployed app still cannot be the target, and the reason is mechanical

`regions.json` is built from the `data-source` attribute that
`scripts/source-stamp.ts` writes, and that plugin is gated on
`ITERA_SOURCE_STAMP=1` **precisely so it never reaches a learner**. Pointing a
capture at `app.iterahq.dev` would produce perfect screenshots and an empty map:
photographs nobody can click.

So the target stays a `vite preview` of a build of this tree — but built with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` pointing at the **real** project
instead of the stub. `VITE_*` is inlined at build time, which is what makes "one
bundle, repointed at runtime" impossible.

State the consequence wherever a capture is published: the bytes are not the
deployed bundle's bytes. Same source at a known commit, same data, same session
— **plus one attribute per element**. What is added is the thing that makes the
picture clickable.

### Running one

```bash
export NODE_AUTH_TOKEN=…            # read:packages, for the private @iterahq registry
export VITE_SUPABASE_URL=…          # Infisical /apps/itera
export VITE_SUPABASE_ANON_KEY=…
ITERA_SOURCE_STAMP=1 npm run build
npx vite preview --port 4189 --strictPort --host 127.0.0.1 &

export ITERA_CAPTURE_USERNAME=…     # /shared ITERA_SMOKE_* or /apps/itera ITERA_E2E_*
export ITERA_CAPTURE_PASSWORD=…
node .capture-build/capture-live.mjs \
  --base http://127.0.0.1:4189 --role tenant_admin --root "$PWD" \
  --params ./params.json --out e2e/artifacts/live-capture/tenant_admin

# the signed-OUT pass — not optional, see below
node .capture-build/capture-live.mjs \
  --base http://127.0.0.1:4189 --role anonymous --anonymous --root "$PWD" \
  --only login,signup,auth_code,auth_forgot,auth_reset,auth_dfl_callback,not_found,g_code \
  --out e2e/artifacts/live-capture/anonymous
```

### 🚨 `tsx` cannot run these — bundle with `esbuild` first

`tsx` compiles with esbuild's `keepNames`, which wraps every function in a
`__name(…)` helper. `page.evaluate(fn)` ships `fn.toString()` to the browser,
where that helper does not exist, so **every** capture dies with
`ReferenceError: __name is not defined` — on all 31 screens, with no hint that
the cause is the transpiler.

```bash
./node_modules/esbuild/bin/esbuild scripts/ux-capture/capture-live.ts \
  --bundle --platform=node --format=esm --packages=external \
  --outfile=.capture-build/capture-live.mjs
```

The outfile must stay **inside the repository** so Node resolves `node_modules`,
and `--packages=external` keeps CommonJS dependencies out of an ESM bundle.
`--root` is passed explicitly for the same class of reason: a `REPO_ROOT`
derived from `import.meta.url` would resolve to the bundle's directory and turn
every stamp into "file does not exist".

### Two passes, because a session redirects away from the signed-out screens

`/login`, `/signup` and `/auth/code` are declared screens, and an authenticated
session bounces off every one of them. A signed-in run can never photograph
them; a run that did not check would file the **home page** under `login`.
`--anonymous` is that second pass, and it is indexed under the role it really
had.

### Two rules that are the whole point

**A silent redirect is the failure this exists to catch.** `RequireRole` does
not render a 403; it redirects. Every screen is verified after navigation — the
landing path must match the requested route segment by segment, with `:param`
matching anything. A mismatch is recorded as `bounced`, with the landing path,
and **no artifacts are written**. A map that is merely incomplete is far better
than one that is confidently wrong.

**Parameters come from a file, never from the source.** Eight declared routes
carry a `:param`, and those values are production row ids: not the repository's
to know, and they rot. `--params` supplies them at run time
(`params.example.json`); a screen with no binding is reported
`skipped-no-param` rather than guessed at.

### What a run writes, and where it goes

```
<out>/<screen_id>/screenshot.png
<out>/<screen_id>/regions.json
<out>/capture-manifest.json     # EVERY declared screen and its verdict
```

Every declared screen appears, including the ones not reached, and
`emit-observed-flows.ts` keeps them in the document with an empty
`screenshots[]`. Coverage means nothing unless the denominator is **what was
declared**, not what happened to work.

Then, per the storage rule of the plan — the repository holds what we declare,
media holds what the machine observed, the DFL database holds the index we ask
questions of:

```bash
dfl-ux-paths ux-map-index \
  --flows itera-player.observed.tenant_admin.flows.json --role tenant_admin \
  --artifact-url https://media.devfellowship.com/<id> --artifact-media-id <id> \
  --captures e2e/artifacts/live-capture/tenant_admin --uploads uploads.json \
  --repo iterahq/itera-player --commit-sha "$(git rev-parse HEAD)" \
  --url … --key <anon> --jwt "$(dfl-auth token)"
```

The write goes through `engineering.index_ux_map_capture`, which reads the
writer from `auth.uid()`. There is no service-role path, and no argument that
names the writer.

### Known gaps of the authenticated run, as measured

- **`/live/instructor/:sessionId`** cannot be reached: every `class_sessions`
  row is `ended`, and the page redirects to `/live/instructor`. It needs a live
  session, which means writing one to production.
- **`/admin`** redirects to `/admin/roster`, which is captured under its own id.
  **`/signup`** redirects to `/login` on this deployment.
- **The clock is frozen** to `FROZEN_EPOCH_MS`, which is what makes two runs
  comparable — so any UI that prints "now" prints that instant, not today.
- **Byte-identity remains keyed to the Chromium revision**, exactly as recorded
  above for the hermetic run. Nothing about a session changes that.
