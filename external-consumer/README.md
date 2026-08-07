# `external-consumer` — the portability proof for `@iterahq/activities`

**Run it:** `npm run external-consumer` (from the repo root) · **CI job:** `external-consumer` in `.github/workflows/ci.yml`
**Plan:** [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib), Fase C

## Why this directory exists

Fase C moved the activity renderers out of the Itera Player and into
`@iterahq/activities`. The claim that makes that worth doing is:

> an activity can be rendered by an application that is not the Itera Player.

Nothing else in this repo tests that claim, and it is easy to believe it is
tested when it is not. `src/test/activityPublicContract.test.ts` has imported
`@iterahq/activities` since Fase B — but it runs **inside the monorepo**, under
the app's Vite/Vitest resolver, through the workspace symlink, with the app's
`tsconfig`, its `@/` alias, its `.npmrc`, its React and 625 hoisted packages on
disk. A green there answers *"does this compile next to the code it came
from?"*, which was never the question.

So this project removes every borrowed condition, deliberately:

| Borrowed condition | Removed how |
| --- | --- |
| The workspace symlink | `npm pack` → install **that tarball** with `--install-links` (`check.sh` asserts the result is not a symlink) |
| The app's `node_modules` | Its own tree. A **phantom dependency** — something the package imports but does not declare — fails here and nowhere else |
| A bundler + TypeScript | Plain Node ESM, plain `React.createElement`. No Vite alias or `paths` entry can participate |
| Itera itself | No `@/i18n`, no `AuthContext`, no supabase client, no Tailwind pipeline, no router. The whole host is ~40 lines |

It also checks the **shape of the published artifact**, which only ever fails at
someone else's install: `dist/index.js` and `dist/index.d.ts` must be in the
tarball, and `src/` must **not** be (shipping it would let a consumer
deep-import past the public barrel, and the barrel is the API).

## What it asserts

1. **Resolution + surface** — imports as ESM from Node with no bundler; the
   barrel does not leak internals; `BUILT_IN_ACTIVITY_KINDS` matches what the
   dispatcher can actually render.
2. **Rendering** — all seven extracted kinds render from a fixture spec, with
   the authored instruction text and the light-markdown formatting on screen.
3. **Answering** — pick + submit on `single_choice` produces `onComplete(true)`
   with the answer text and the full action sequence, and a wrong pick grades
   false.
4. **Telemetry (ADR-4)** — `activity.viewed` on mount, `activity.completed` on
   settle, carrying the verdict and the kind.
5. **ADR-1** — no bottom bar, no progress, no hearts, no navigation, no links.
6. **ADR-3** — `fetch`, `XMLHttpRequest` and `sendBeacon` are rigged to **throw**,
   so a backend call is a red run with the URL in the message rather than a
   silent pass. A kind the package did not extract degrades to a visible
   placeholder and emits `port.unavailable`; a host can supply that kind itself.
7. **i18n** — a consumer that wires only a locale sees Portuguese, not
   translation keys; English is a one-argument change; a host's own translation
   wins, and keys the host does *not* translate still fall back per key.
8. **The shuffle** — two learner ids get two different arrangements of the same
   options, and one learner gets the same arrangement twice. This is the
   property that fails **silently** when `identity.userId` stops being wired.

## What it is not

- **Not a visual check.** The renderers are styled with Tailwind utilities
  against the design-system tokens, and this harness runs no Tailwind build, so
  it proves the DOM and the behaviour, not the pixels. Styling in a foreign app
  is a real open risk and it is Fase D's to close.
- **Not a registry check.** It installs from a tarball. Whether a clean project
  can resolve `@iterahq/*` from GitHub Packages is answered by the
  `registry-resolution` job, against an empty npm cache.
- **Not a workspace.** The root `workspaces` glob is `packages/*`; this
  directory is deliberately outside it, and `npm install` at the root does not
  touch it.

## Adding a kind

When Fase C step 4 or 5 lands a kind (`sandbox_scenario`, `code`, BYOC, the
AI-judged `document`), add a fixture to `fixtures.json` under its kind name.
The "advertises the kinds it can render" check **fails if a kind is advertised
and has no fixture**, so coverage cannot quietly fall behind the package.

Kinds that need a port must be exercised with a **stub** port injected here —
never a real client. A harness that talks to `api.iterahq.dev` is testing the
Itera backend, not the library.
