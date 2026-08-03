# `@iterahq/activities` — the public contract (Fase A)

**Plan:** [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib)
· **Parent:** `20260803-itera-learning-control-plane-prototipo`
**Status:** Fase A done — contract defined. **No code has moved.**
**Types:** this folder — `src/components/branded/activity/contract/`
**Guard:** `src/test/activityPublicContract.test.ts`

> Lives here rather than in `docs/` for two reasons: `docs/` is gitignored in
> this repo, and the contract should travel with the code it describes — when
> Fase B moves `src/components/branded/activity/**` into
> `packages/activities/`, this file becomes the package README.

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

The package publishes to the **npm `iterahq` org** (`@iterahq/activities`),
answering plan Open Question 2. The publishing token lives in Infisical at
`/infra/npm/NPM_TOKEN_TAINAN` and covers both the `iterahq` and `devfellowship`
scopes. **Nothing is published in Fase A** — this records the target only.

✅ **Registry collision resolved (2026-08-03).** This repo previously pinned the
whole scope at GitHub Packages (`@iterahq:registry=https://npm.pkg.github.com`),
with CI's `setup-node` configuring the same registry for `@iterahq` — so an
`@iterahq/activities` published to npmjs would *not* have been resolvable here.
Both `.npmrc` and all five `setup-node` blocks (`ci.yml` ×3, `e2e.yml`,
`storybook.yml`) now point at `https://registry.npmjs.org`, and `NODE_AUTH_TOKEN`
reads from `secrets.NPM_TOKEN` instead of `secrets.GITHUB_TOKEN` (a GitHub token
must never be sent as a bearer credential to a third-party registry).

Nothing resolved from GitHub Packages at the time of the switch — the only
`@iterahq` dependency is `activity-spec`, vendored as a `file:` tarball — so the
change was configuration-only with no install-path risk. Installs are verified to
work with `NODE_AUTH_TOKEN` unset or empty, which is the current CI state: no
`NPM_TOKEN` secret exists at the org or repo level yet. One must be created from
Infisical `/infra/npm/NPM_TOKEN_TAINAN` before the first **private** publish;
a public `@iterahq/activities` would install fine without it.

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
| — | Registry: the npm **`iterahq`** org (plan Open Question 2). |
