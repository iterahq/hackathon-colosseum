# `@iterahq/activities`

Portable Itera activity renderers — **activity level, not player level** (ADR-1
of [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib)).
No bottom bar, no progress bar, no hearts, no routing: those stay in the
`LessonPlayer`.

> **v0.1.0 ships the public CONTRACT only — types, zero runtime.** The renderers
> move here in Fase C. Publishing the contract first is deliberate: a host app
> (the LCPWCI prototype in `dfl-labs`) can already type its ports, stub them and
> compile against the real boundary before a single component moves.

The design doc — port-by-port rationale, per-kind coverage, Fase C extraction
order — is [`CONTRACT.md`](./CONTRACT.md).

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

This is the setup friction ADR-6 accepted in exchange for keeping the IP closed.
Budget for it in every new consumer.

## Usage

```tsx
import type {
  ActivityRendererProps,
  ActivityProviderProps,
  ActivityEvent,
} from '@iterahq/activities';
```

The shape the renderers will implement in Fase C:

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

## Peer dependencies

`@iterahq/activity-spec` (>=0.7.0, itself private on GitHub Packages) and
`react`. `@devfellowship/components` + Tailwind become peers in Fase C, when
components that need them actually arrive — declaring them now would force a
Tailwind setup on a host that only imports types.

## Development

This package is a workspace of `iterahq/itera-player`:

```sh
npm install                              # from the repo root; links the workspace
npm run build -w @iterahq/activities
```

`npm install` at the root runs the package's `prepare` script, so `dist/` exists
before the app typechecks or tests against it.

## Publishing

`.github/workflows/release-activities.yml` — `workflow_dispatch`, publishes to
GitHub Packages with the repo's own `GITHUB_TOKEN` and then verifies both sides
of the privacy claim (anonymous read must fail, authenticated read must return
the manifest). Bump `version` in this `package.json` in the PR; the workflow
refuses to republish an existing version.
