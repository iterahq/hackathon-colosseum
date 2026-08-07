# `@iterahq/activities`

Portable Itera activity renderers — **activity level, not player level** (ADR-1
of [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib)).
No bottom bar, no progress bar, no hearts, no routing: those stay in the
`LessonPlayer`.

> **Fase C landed: the renderers are here.** v0.1.0 shipped types only; the
> package now has runtime and renders **eight** kinds on its own — the seven
> backend-free question kinds from steps 1–3, plus `sandbox_scenario` from step
> 4. What did NOT move — and why each one stayed — is the table below; read it
> before assuming a kind is available.

The design doc — port-by-port rationale, per-kind coverage, extraction order —
is [`CONTRACT.md`](./CONTRACT.md). The proof that this is genuinely consumable
from outside the Player is [`external-consumer/`](../../external-consumer/) at
the repo root, which installs a **packed tarball** into its own project and
renders from fixture specs with no bundler and no Itera anything.

## What renders, and what does not

`BUILT_IN_ACTIVITY_KINDS` is the machine-readable version of the left column;
`isBuiltInActivityKind(kind)` is how a host asks before it mounts.

| Kind | Here? | Why |
| --- | --- | --- |
| `concept` · `concept_reveal` · `video` · `single_choice` · `multi_choice` · `match` · `order` | ✅ | Backend-free. Fase C steps 1–3. |
| `sandbox_scenario` | ✅ | Fase C **step 4**. One kind, five activity types: the chat sandbox (open / choices / slots) and the terminal sandbox (free text / options). **It needs no port** — every reducer is `@iterahq/activity-spec/runtime`'s, so a host gets a multi-turn graded micro-experiment with nothing injected but i18n. |
| the LIVE sandbox (`sandbox-live`) · BYOC | ❌ | The AI-judged twins. They are the ones that actually consume `api.respond` / `api.judge` / `api.generateByoc`, and BYOC had ~10 of its 12 files open in another PR while this one landed. Extracting under that is conflict, not extraction. |
| `code` | ❌ | Fase C **step 5** — Monaco behind a separate `@iterahq/activities/code` entrypoint (ADR-5), never in the base bundle. |
| `document` · `diagram` · `quiz` | ❌ | Not files: they are inline functions inside the Player's 700-line dispatcher. `CONTRACT.md` finding 4 says to lift them when the PR queue drains. |

A kind that is not here is **not a dead end**: pass your own component through
`ActivityHostContext.renderers`, and it wins over any built-in of the same kind.
An unknown kind with no host renderer draws a visible placeholder and emits
`port.unavailable` — it never throws.

## This package is PRIVATE

It is DFL/Itera intellectual property (ADR-6). It is **not** on the public npm
registry and never will be. It is published to **GitHub Packages** under the
`iterahq` org:

```
https://npm.pkg.github.com/@iterahq/activities
```

Anonymous reads get `401`. That is the point — verify it yourself:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://npm.pkg.github.com/@iterahq/activities
# -> 401
```

## Consumer setup

Installing a private GitHub Packages package needs **two** things: an `.npmrc`
that routes the `@iterahq` scope, and a token that is allowed to read it.

### 1. `.npmrc` in the consuming repo

```ini
@iterahq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Keep the `${NODE_AUTH_TOKEN}` indirection. Never commit a literal token.

### 2. A token that can read the package

```sh
export NODE_AUTH_TOKEN=ghp_...   # your own token, never a shared one
npm install @iterahq/activities
```

Which token works depends on where you are installing from:

| Where | Token | Requirement |
| --- | --- | --- |
| A developer's machine | a **classic** GitHub PAT with the `read:packages` scope | Classic only. GitHub Packages' npm registry rejects fine-grained PATs — the error is `403 permission_denied: The token provided does not match expected scopes`, which reads like a missing scope rather than an unsupported token type. |
| GitHub Actions **in `iterahq/itera-player`** | `${{ secrets.GITHUB_TOKEN }}` with `permissions: packages: read` | Works out of the box: this repo publishes the package, so it owns it. |
| GitHub Actions **in any other repo** | `${{ secrets.GITHUB_TOKEN }}` **only after an access grant** — otherwise a PAT secret | ⚠️ See below. |

### ⚠️ Cross-repo consumers need an explicit access grant

A GitHub Packages package grants Actions access to its **publishing repository
only**. Another repo's `GITHUB_TOKEN` — even in the same org, even with
`permissions: packages: read` — gets `403 permission_denied: read_package`.
Measured, not assumed: run `30910892639` in this repo proved exactly that against
`@iterahq/activity-spec`.

There is no org-wide "every member's workflows can read" mode on a Free org, and
no REST endpoint for the grant. An org owner must do it in the UI:

> `github.com/orgs/iterahq/packages/npm/<package>/settings` → **Manage Actions
> access** → *Add repository* → pick the consumer → **Read**

Alternatively, store a classic PAT with `read:packages` as a secret in the
consuming repo and use it as `NODE_AUTH_TOKEN`.

**Worked example.** `iterahq/itera-player` consumes `@iterahq/activity-spec`,
which is published by a *different* repo. It got the grant on 2026-08-04, and
the effect is measurable: run `30910892639` attempt 1 (before) → `403
permission_denied: read_package`; attempt 2 (after) → `200` with
`dist-tags.latest = 0.7.0`, while an anonymous read still returns `401`. That
grant is what let PR #275 delete the vendored tarball. No new credential was
created — the grant changes what the *existing* ephemeral `GITHUB_TOKEN` may
read.

This is the setup friction ADR-6 accepted in exchange for keeping the IP closed.
Budget for it in every new consumer: it is **per repo**, **manual**, and
**UI-only** — GitHub exposes no REST endpoint for it, so it cannot be scripted.

## Usage

```tsx
import type {
  ActivityRendererProps,
  ActivityProviderProps,
  ActivityEvent,
} from '@iterahq/activities';
```

The whole of it:

```tsx
<ActivityProvider
  i18n={…}        // replaces the host's @/i18n
  api={…}         // ports: listSeeds, generateContext, judge, respond, byoc
  identity={…}    // replaces the host's auth context
  theme={…}       // design-system tokens
  storage={…}     // optional; defaults to localStorage
>
  <ActivityRenderer
    activity={activity}            // validated by @iterahq/activity-spec
    onComplete={(correct) => …}
    onEvent={(event) => …}         // telemetry (ADR-4)
    reveal={false}
  />
</ActivityProvider>
```

The package **never** fetches and **never** reads a session — the host injects
already-authenticated ports (ADR-3). A missing port is a capability probe, not a
crash: `Boolean(api?.judge)` replaces the old `iteraApiConfigured()`.

### The smallest working host

`i18n` is the only required port, and the package ships its own activity
dictionary, so this is a complete consumer:

```tsx
import { ActivityProvider, ActivityRenderer, createActivityI18n } from '@iterahq/activities';

<ActivityProvider i18n={createActivityI18n('pt')} identity={{ authenticated: false, userId }}>
  <ActivityRenderer activity={activity} onComplete={(correct) => …} />
</ActivityProvider>
```

⚠️ **`identity.userId` is load-bearing and fails silently.** The choice and
ordering kinds shuffle per (learner, activity) so two learners side by side
cannot copy *"it's the third one"*. Omit `userId` and every learner in your app
falls back to one per-browser anonymous scope: each still sees a stable order,
nothing errors, and the pedagogical property is simply gone. Pass an opaque,
stable per-learner id.

## Dependencies

**Runtime:** `lucide-react`, `framer-motion` — real dependencies, installed with
the package.

**Peers:** `react` (^18.3.1) and `@iterahq/activity-spec` (>=0.8.0). The spec
package is a **types-only** peer: `dist/**/*.js` contains no import of it, so a
JavaScript consumer that never typechecks does not need it installed.

**Styling is NOT a dependency, and that is the honest gap.** The renderers carry
Tailwind utility classes against the brand tokens `@devfellowship/components`
defines (`evergreen`, `menta`, `obsidiana`, `border`, `card`, …). The package
ships no CSS and no Tailwind plugin, so a host with no Tailwind pipeline renders
correct, interactive, **unstyled** activities. Two things a consumer must do:

1. add `node_modules/@iterahq/activities/dist/**/*.js` to its Tailwind `content`
   globs (the classes live in the built files, not in your `src`);
2. define the brand tokens — installing `@devfellowship/components` is the
   short path.

This is the risk the plan named as *"design tokens não viajam"*, and it is
explicitly **not** closed by the external-consumer check, which asserts DOM and
behaviour rather than pixels. Fase D is where it gets tested rather than
asserted.

## Development

This package is a workspace of `iterahq/itera-player`:

```sh
npm install                              # from the repo root; links the workspace
npm run build -w @iterahq/activities
```

`npm install` at the root runs the package's `prepare` script, so `dist/` exists
before the app typechecks or tests against it.

⚠️ **The app consumes `dist/`, not `src/`** — the workspace symlink resolves
through `main`/`exports`. That is deliberate (the app exercises the same module
edge an external host does), and it has one consequence worth knowing: editing
a file here does nothing until the package is rebuilt. The app's `predev`,
`pretest`, `pretypecheck` and `prebuild` scripts all run `build:packages` for
exactly that reason, so the only way to test a stale `dist/` is to invoke
`vitest`/`tsc` directly.

To exercise the package the way an outside app would:

```sh
npm run external-consumer     # packs a tarball, installs it elsewhere, renders
```

## Publishing

`.github/workflows/release-activities.yml` — `workflow_dispatch`, publishes to
GitHub Packages with the repo's own `GITHUB_TOKEN` and then verifies both sides
of the privacy claim (anonymous read must fail, authenticated read must return
the manifest). Bump `version` in this `package.json` in the PR; the workflow
refuses to republish an existing version.
