# `@iterahq/activities` — the public contract

**Plan:** [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib)
· **Parent:** `20260803-itera-learning-control-plane-prototipo`
**Status:** Fase A done (contract defined) · Fase B done (workspaces + the
contract now lives in the package). **No renderer has moved yet — that is Fase C.**
**Types:** `packages/activities/src/`
**Guard:** `src/test/activityPublicContract.test.ts`

> Fase A wrote this doc inside `src/components/branded/activity/contract/` so it
> would travel with the code it describes. Fase B moved it here, next to the
> types, and the app now imports them as `@iterahq/activities` through the npm
> workspace.

## What this is

The activity renderers are going to become a package that any React app can
install, because as interaction moves to MCP the *rendering of a human-facing
micro-experiment* is the piece that cannot move into the model. Fase A defines
the boundary that extraction has to respect. Fase B moves the files.

**Nothing in this phase changes what renders.** The contract module is
types-only — no component, no constant, no helper — so it compiles to an empty
module and adds nothing to any bundle. That is asserted, not promised:
`expect(Object.keys(contract)).toEqual([])`.

## The contract

```tsx
<ActivityProvider i18n={…} api={…} identity={…} theme={…} storage={…}>
  <ActivityRenderer
    activity={activity}                    // validated by @iterahq/activity-spec
    onComplete={(correct, detail) => …}    // EXISTING contract, preserved exactly
    onEvent={(event) => …}                 // NEW — telemetry (ADR-4)
    reveal={false}
    live={false}
  />
</ActivityProvider>
```

`i18n` is the only required member of the provider. Everything else is optional
and degrades explicitly (ADR-3): an absent port is the capability probe, which
is what replaces today's `iteraApiConfigured()` env read.

### What each port replaces

| Port | Replaces | Occurrences today | Note |
| --- | --- | --- | --- |
| `i18n` | `@/i18n` | 24 | Only `t`, `tText`, `locale`. Measured: no call site under `branded/activity/**` destructures anything else. `useI18n()` already satisfies it — the Player's adapter is the hook itself. |
| `api` | `@/api/iteraApi`, `@/api/iteraByoc` | 5 + 1 | `listSeeds` · `generateContext` · `judge` · `respond` · `generateByoc` · `readByoc`. Signatures mirrored from the real client, **minus the `token` argument**. |
| `identity` | `@/auth/AuthContext` | 3 | `authenticated` + `loading`. All three call sites read exactly `session?.access_token` and `loading`; nothing reads email, id, roles or tenant. |
| `identity.artifactAudience` | `@/services/artifact.service#hasTenantAudience` | 1 | **Not in the plan's coupling table.** See findings. |
| `storage` | `@/services/codeSnapshot.service` | 1 (via `useCodeSnack`) | **Not in the plan's coupling table.** See findings. |
| `theme` | Tailwind + `@devfellowship/components` tokens | — | Scoping seam only. The package does not ship a theming engine; the design system is a **peerDependency**. |

### Why the ports take no token

Every backend call today ends in `token: string`, and every call site fills it
the same way: `useAuth().session?.access_token ?? ''`. Threading that through
the port would make the library a credential handler — receiving a token,
holding it in React state, handing it back on each call.

Instead the **host injects ports already bound to its own auth**. The Itera
Player's adapter is a closure:

```ts
const api = useMemo<ActivityApiPort>(() => {
  const token = session?.access_token ?? '';
  return {
    listSeeds,
    generateContext: (id, seed) => generateContext(id, seed, token),
    judge: (id, content, ctx) => judge(id, content, token, ctx),
    respond: (input, system) => respond(input, token, system),
    generateByoc: (id, seed, regenerate) => generateByoc(id, seed, token, regenerate),
    readByoc: (id) => readByoc(id, token),
  };
}, [session?.access_token]);
```

The package never sees a credential; `identity.authenticated` is all it needs to
know whether a port call can succeed.

### Why `onEvent`'s payload is open (ADR-4) and how it hardens

The telemetry schema is Fase 1 of the parent plan and does not exist. The
*emission point* has to exist anyway, or every host that adopts the library in
the interval is a permanent blind spot.

Three rules keep the hardening additive:

1. `type` is `KnownActivityEventType | AnyOtherString`. Adding a literal is
   additive — arbitrary strings were always accepted; the literals only buy
   autocomplete.
2. `ActivityEvent['payload']` stays `Record<string, unknown>` **forever**. Typed
   payloads land in the `ActivityEventPayloads` overlay, which consumers opt
   into via `TypedActivityEvent<'answer.submitted'>`. The base type is never
   narrowed, so a stricter schema cannot break an existing handler.
3. New top-level fields are optional. Never required.

Anything that cannot be done that way is a MAJOR of the package, and it trades
away the ADR-4 promise — say so explicitly in that PR.

## Registry

**GitHub Packages, private** — `https://npm.pkg.github.com`, scope `@iterahq`
(ADR-6 + the 2026-08-04 registry decision).

### Why not npmjs

ADR-6 requires the package to be PRIVATE: it is DFL/Itera intellectual property.
The npm org `iterahq` is on the **FREE** plan, and a free npm org can only
publish **PUBLIC** packages — so publishing there would do the exact thing ADR-6
forbids. GitHub Packages gives a private package at no extra registry cost and
keeps the name `@iterahq/activities`, because its npm scope is the GitHub org
name. **ADR-6 is preserved; only the registry moved** — which ADR-6 itself
already named as its mitigation 2.

This reverses the direction of PR #256, which had repointed the scope from
GitHub Packages to npmjs on 2026-08-03 in anticipation of a paid npm org. The
`.npmrc` and all five `setup-node` blocks (`ci.yml` ×3, `e2e.yml`,
`storybook.yml`) now point at `https://npm.pkg.github.com` again, and
`NODE_AUTH_TOKEN` reads `secrets.GITHUB_TOKEN` — not `secrets.NPM_TOKEN`, which
is an npmjs credential and must never be sent to a different registry.

The npm token at Infisical `/infra/npm/NPM_TOKEN_TAINAN` is **no longer needed
by this repo**. The `NPM_TOKEN` repo secret is now unreferenced by any workflow.

### The cross-repo access cost, measured

A GitHub Packages package grants Actions access to its **publishing repository
only**. Another repo's `GITHUB_TOKEN` — same org, `permissions: packages: read`
set — gets `403 permission_denied: read_package`. Proven in this repo by run
`30910892639`, reading `@iterahq/activity-spec` (published from
`iterahq/activity-spec`). There is no org-wide read mode on a Free org and no
REST endpoint for the grant; an org owner must add each consumer under
*package settings → Manage Actions access*, or the consumer must carry a
**classic** PAT with `read:packages` (fine-grained PATs are rejected by the
GitHub Packages npm registry).

**This repo has the grant** (2026-08-04). An org owner added
`iterahq/itera-player` under *Manage Actions access* of the `activity-spec`
package, which is what made PR #275 possible. Consumer setup is documented in
`packages/activities/README.md`.

## ✅ Closed — the vendored tarball is gone (PR #275, 2026-08-04)

`package.json` reads `"@iterahq/activity-spec": "^0.7.0"` and
`vendor/iterahq-activity-spec-0.7.0.tgz` was deleted. The Fase B exit criterion
"zero `file:vendor/*.tgz`" is met.

The history is worth keeping, because the reason it stalled was not the one the
plan predicted:

- The plan assumed no publish had ever succeeded in the `iterahq` org. That is
  true of **npmjs** and false of **GitHub Packages**:
  `@iterahq/activity-spec@0.7.0` was published there on 2026-08-03 16:59Z
  (`iterahq/activity-spec` run `30834659269`, changesets), and it is private —
  an anonymous read of `https://npm.pkg.github.com/@iterahq/activity-spec`
  returns `401`. The pipeline existed and worked all along.
- What blocked the swap was **read access, not publication** — `403
  read_package` (run `30910892639`), and no vault token carries `read:packages`.
- What unblocked it was a **manual grant by an org owner**, not a credential.
  Same run `30910892639`, attempt 2, re-run after the grant: `GITHUB_TOKEN`
  → `200`, anonymous → `401`, `NPM_TOKEN` → `401`. Read access gained, privacy
  intact, no new secret anywhere.

**The `registry-resolution` job in `ci.yml` is the regression guard.** It fails
if a `file:` dependency or a `vendor/*.tgz` comes back, and it runs `npm ci`
against an **empty** npm cache so a green cannot be produced by a warm cache
hiding a revoked grant.

⚠️ **`itera-api` and `itera-mcp` still vendor the same tarball, and `dfl-labs`
(Fase D) will hit the same wall.** The grant is **per consumer repo**, manual,
UI-only — there is no REST endpoint for it, so it cannot be scripted or rolled
out fleet-wide. Budget an org-owner action for each new consumer.

## Extraction order (Fase C), ascending coupling

Each step keeps the Player byte-identical; Storybook + tests + e2e are the gate
per step, not per phase.

1. **Pure logic** — `answerMachine`, `seededShuffle`, `richText*`,
   `localizedText`, `activitySpecBoundary`, `byocSpec`/`byocAnswer`, the
   `content` types the activities read.
2. **Primitives** — `InstructionPanel`, `RichText`/`RichSpans`/`RichBlock`/
   `RichSteps`/`RichReveal`, `AnswerExplanation`, `parts`, `FeedbackFooter`.
3. **Backend-free kinds** — `concept`, `video`, `single_choice`,
   `multi_choice`, `match`, `order`. Plus `document`/`diagram`/`quiz`, which
   have to be **lifted out of `ActivityRenderer.tsx` into their own files
   first** — today they are inline functions in the 700-line dispatcher.
4. **Backend-backed kinds** — `sandbox_scenario`, BYOC, the AI-judge `document`
   path, `JudgeHeatmap` → all go through the injected ports.
5. **Heavy kinds** — `code` / Monaco / the preview iframe → separate entrypoint
   `@iterahq/activities/code` (ADR-5), never in the base bundle.
6. **i18n** — swap the 24 imports for the provider. Last, and alone: it is the
   biggest coupling and the one whose failure mode is "every string breaks".

## Per-kind coverage

The plan's Fase A exit criterion is *"o contrato cobre os 9+ kinds existentes
sem exceção especial"*. Checked mechanically in
`src/test/activityPublicContract.test.ts`: for each renderer, the props it
demands minus the props the contract exposes must be empty, and `onComplete`'s
first argument must be `boolean`.

| Kind | Props fit | Ports needed | Notes |
| --- | --- | --- | --- |
| `concept` | ✅ | `i18n` | Reads `live` (stepped instruction panel). |
| `video` | ✅ | `i18n` | — |
| `single_choice` | ✅ | `i18n` | — |
| `multi_choice` | ✅ | `i18n` | — |
| `match` | ✅ | `i18n` | — |
| `order` | ✅ | `i18n` | — |
| `document` | ✅ | `i18n`, `api.listSeeds`/`generateContext`/`judge`, `identity` | Two paths (reflection · AI-judge). Inline in the dispatcher; also mounts `ArtifactVisibilityNotice` → see finding 1. |
| `diagram` | ✅ | `i18n` | Inline in the dispatcher. |
| `quiz` | ✅ | `i18n` | Inline in the dispatcher. |
| `sandbox_scenario` (self-paced) | ✅ | `i18n` | Judging is `@iterahq/activity-spec/runtime` — pure, no backend. |
| `sandbox_scenario` (live/BYOC) | ✅ | `i18n`, `api.respond`/`judge`, `identity` | Reached via `LiveActivityRenderer`, not `ActivityRenderer` → see finding 3. |
| `code` | ✅ | `i18n`, **`storage`** | Monaco behind the `/code` entrypoint (ADR-5) → see finding 2. |
| BYOC (a **layer**, not a kind) | ⚠️ one extra prop | `i18n`, `api.generateByoc`/`readByoc`, `identity` | `ByocActivity` takes `spec` in addition. It is a dispatcher-internal handoff (`resolveByocSpec` runs *before* the kind switch), never something a host supplies — so the public surface is unchanged. Asserted explicitly so a *second* extra prop turns the test red. |

**Verdict: the contract covers every kind.** The four things worth flagging are
below — none of them require bending the contract, but two of them mean the
plan's coupling table was incomplete.

## Findings — where reality disagreed with the plan

1. **A second backend, missed by the audit.** `ArtifactVisibilityNotice`
   (mounted inside the `document` reflection path) calls `hasTenantAudience()`
   from `@/services/artifact.service`, which queries **Supabase directly** from
   inside the activity tree. The plan's coupling table counted only
   `@/api/iteraApi`, so this never appeared. A library cannot hold a Supabase
   client, so the host resolves the fact and passes the answer:
   `identity.artifactAudience`. Omitted ⇒ `'unknown'` ⇒ the notice stays
   hidden, which is exactly the component's existing fail-closed behaviour.

2. **The `code` kind needs a storage port.** `useCodeSnack` autosaves the
   learner's source through `@/services/codeSnapshot.service` (localStorage) so
   a reload does not discard their work. Not a backend call, so it did not show
   up in the `@/api/*` count — but it is host state. Optional port, defaulting
   to localStorage (today's behaviour). ⚠️ Read/write/clear must move together;
   `UseCodeSnackCallbacks.onAutosave` already documents why overriding only the
   write side hands the learner back the wrong source.

3. **There are two dispatchers, and only one is in scope.**
   `LiveActivityRenderer` wraps `ActivityRenderer` with the same props plus
   `forceLive`, and it — not `ActivityRenderer` — is what routes the live BYOC
   `sandbox_scenario`. Its live branch is gated on `iteraApiConfigured()`, an
   env read. Under the contract that gate becomes `Boolean(api?.respond)`. The
   wrapper itself looks like **host routing, not an activity**, so the working
   assumption is that it stays in the Player and the package exports the live
   variant as a kind the base dispatcher can reach. Confirm before Fase C step 4
   — getting it wrong drags live-class concerns into the package.

4. **`document` / `diagram` / `quiz` are not files.** They are inline functions
   inside `ActivityRenderer.tsx`. Fase C step 3 has to lift them out before it
   can move them, and that lift is the one step in the whole extraction that
   touches the dispatcher every other open PR also touches. Sequence it when the
   PR queue is drained.

Also worth recording, though not a contract problem: the app's `Activity` type
carries `lessonId`, `ordinal`, `publishStatus` and `artifactPolicy`, and **no
renderer reads any of them** — a grep of `activity.<field>` across the folder
returns only `spec`, `status`, `id`, `kind`, `rubric`. `PortableActivity` asks
for those five. The Player passes its existing rows unchanged (the guard asserts
`Activity` is assignable to `PortableActivity`); the reverse is deliberately
false, because making it true would drag the Itera content model into the
package, which is what ADR-1 refuses.

## Decisions already locked — do not relitigate

| ADR | Decision |
| --- | --- |
| ADR-1 | Export at **activity** level. No bottom bar, progress, hearts or routing. |
| ADR-2 | **npm workspaces**, not Turborepo. |
| ADR-3 | Dependency inversion — the host injects ports; the package never fetches and never reads a session. |
| ADR-4 | `onEvent` ships in v1 with an open payload. |
| ADR-5 | Monaco/`code` behind `@iterahq/activities/code`, not the base bundle. |
| — | `@devfellowship/components` is a **peerDependency** (plan Open Question 3). |
| ADR-6 | Package is **PRIVATE** — DFL/Itera IP. Registry: **GitHub Packages** under the `iterahq` GitHub org (2026-08-04; npm free orgs can only publish public). |
