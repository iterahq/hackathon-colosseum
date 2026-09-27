# `@iterahq/activities`

Portable Itera activity renderers — **activity level, not player level** (ADR-1
of [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib)).
No bottom bar, no progress bar, no hearts, no routing: those stay in the
`LessonPlayer`.

> **Fase C landed: the renderers are here.** v0.1.0 shipped types only; the
> package now has runtime and renders **nine** kinds from its base entrypoint —
> the seven backend-free question kinds from steps 1–3, plus `chat_sandbox` and
> `terminal_sandbox` from step 4 — and a tenth, `code`, from a **separate entrypoint**
> (`@iterahq/activities/code`, step 5). What did NOT move — and why each one
> stayed — is the table below; read it before assuming a kind is available.

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
| `chat_sandbox` · `terminal_sandbox` | ✅ | Fase C **step 4**. Two kinds, five activity types: the chat sandbox (open / choices / slots) and the terminal sandbox (free text / options). **They need no port** — every reducer is `@iterahq/activity-spec/runtime`'s, so a host gets a multi-turn graded micro-experiment with nothing injected but i18n. |
| the LIVE sandbox (`sandbox-live`) · BYOC | ❌ | The AI-judged twins. They are the ones that actually consume `api.respond` / `api.judge` / `api.generateByoc`, and BYOC had ~10 of its 12 files open in another PR while this one landed. Extracting under that is conflict, not extraction. |
| `code` | ⚠️ **other entrypoint** | Fase C **step 5**. It is here, but behind `@iterahq/activities/code` (ADR-5) and deliberately absent from `BUILT_IN_ACTIVITY_KINDS`, so a consumer that never renders a snack pays for none of it. See *Consuming the `/code` entrypoint*. |
| `question` | ✅ | **1.2.0.** The first built-in that **never grades**: no correct answer, no verdict UI, no shuffle (the asker's order is content), and free text beside the options. **1.3.0:** the CALLER decides "Outro" and the notes box (`callerOptions`), and `QuestionActivityBody` is the same body as a controlled component. It is also the first kind here with **no row in `itera.activities` and no label in the `itera.activity_kind` enum** — the plans-app is what mounts it. Needs no port but i18n. See *Non-grading kinds* in `CONTRACT.md`. |
| the ONE-BEHAVIOUR kinds: `chat_compose` · `chat_fill_select` · `chat_fill_type` · `chat_pick_context` · `chat_rate_reply` · `terminal_type_command` · `terminal_pick_command` · `terminal_build_command` · `document_read` · `document_reflect` · `document_ai_judge` · `question_pick_one` · `question_pick_many` · `question_write` | ✅ | **1.4.0** (plan `20260924-activity-type-one-behavior-rule`). One kind = one behaviour, on the same shared components as the old kind; the KIND pins the input. `document_ai_judge` without `api.judge` shows an explicit "unavailable" state — never the reflection. The five `code_*` kinds are on the `/code` entrypoint, like `code`; the three `byoc_*` kinds stay in the Player, like BYOC. See *The renderers of the new kinds* in `CONTRACT.md`. |
| `document` · `diagram` · `quiz` | ✅ | **Fase D.** They were never files — they were inline functions inside the Player's ~700-line dispatcher, which is why they were last (`CONTRACT.md` finding 4). Together they are **48% of the authored library** (`document` 24 defs, `quiz` 22, `diagram` 13 of 123), so until 0.4.0 a host that was not the Player rendered most of the catalogue as an unsupported-kind placeholder. `document` is ONE kind with THREE renderers: `rubric.mode === 'ai-judge'` **and** `api.judge` → the AI-judged one; a prompt or a `min_words` rubric → the reflection one; otherwise a read-only card. Without `api.judge` it degrades to reflection — a real screen, not a placeholder. |

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
    priorAnswer={savedDetail}      // replay a completed activity — see below
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

### Showing a COMPLETED activity as the learner left it

Pass `activity.status = 'done'` on its own and the activity renders fresh and
merely greyed: no option marked, no verdict, "Enviar" still on screen. That is
deliberate — the render does not know which answer the learner gave, and
guessing would colour the button at random.

Give it that answer and it settles into the state the learner left it in:

```tsx
// 1. When the learner answers, keep the DETAIL — not just `correct`.
<ActivityRenderer activity={row} onComplete={(correct, detail) => save(row.id, detail)} />

// 2. On any later render of that same row, hand it back.
<ActivityRenderer activity={{ ...row, status: 'done' }} priorAnswer={load(row.id)} … />
```

`priorAnswer` is typed as `ActivityCompletion` — literally the `detail` your
`onComplete` received. Persist the whole object: `response` is a human-readable
summary built from labels and cannot be keyed back to an option, so a host that
saves only `response` cannot replay. The machine-readable answer lives in
`actions`.

Supported by `single_choice`, `multi_choice`, `order`, `match` and `question`.
Kinds that never grade ignore it. `quiz`, `code`, the sandboxes and BYOC do not
restore yet — see `CONTRACT.md` for the reason in each case.

⚠️ **`question` is the one exception to "the machine-readable answer lives in
`actions`".** Its free text lives in `response`, because there it is not a
summary built from labels — it is the person's own prose, verbatim, and free
text has no id to key back to. The trace carries `has_text`, never the words.
Persisting the whole `detail`, as above, already gets both halves.

Three things it deliberately will not do:

- **It carries no verdict.** You replay what the learner PICKED; the kind
  re-grades it. There is no field to assert "this was correct" in.
- **It never settles an unfinished activity.** Replay onto a `todo` or
  `in_progress` row and the inputs are seeded, but nothing is graded or locked —
  the learner can still answer.
- **It never fires `onComplete`.** A replay is a render, not an event.

## Consuming the `/code` entrypoint

`code` is a single-file React snack: an editor on the left, a live preview on the
right, and — when the spec ships `checks` — a deterministic submit/verdict/retry
lifecycle graded against the DOM the learner's code produced.

It is not in `BUILT_IN_ACTIVITY_KINDS`. `<ActivityRenderer>` from the base
bundle answers `code` with the unsupported-kind placeholder until you register
it, through the same `renderers` seam any host-supplied kind uses:

```tsx
import { ActivityProvider, ActivityRenderer, createActivityI18n } from '@iterahq/activities';
import { CodeActivity } from '@iterahq/activities/code';

<ActivityProvider
  i18n={createActivityI18n('pt')}
  renderers={{ code: CodeActivity }}
>
  <ActivityRenderer activity={row} onComplete={(correct, detail) => …} />
</ActivityProvider>
```

### The editor is a port, not a dependency

**This package ships no editor.** Not Monaco, not CodeMirror, not even as an
optional peer. Omit `codeEditor` and you get a plain, dependency-free
`<textarea>` (`data-testid="code-editor"`) — a real editing surface; what a
learner loses is syntax highlighting, not the exercise.

To use your own, pass a component with four props — `value`, `onChange`,
`language`, `readOnly`:

```tsx
import Editor from '@monaco-editor/react';           // your dependency, not ours

const MonacoSurface = ({ value, onChange, language, readOnly }) => (
  <Editor
    height="100%"
    language={language}
    value={value}
    onChange={(next) => onChange?.(next ?? '')}
    options={{ readOnly, minimap: { enabled: false } }}
  />
);

<ActivityProvider i18n={…} codeEditor={MonacoSurface} renderers={{ code: CodeActivity }}>
```

Why the package refuses to own that choice: the Itera Player's own editor
publishes every caret move on a `window` CustomEvent so a live class can mirror
the learner's cursor onto the professor's stage, and it configures Monaco's
TypeScript worker against that repo's self-hosted vendoring. Both are Itera
concerns. Shipping them would export a live-session protocol and a build-time
asset layout to every consumer — so the Player injects its editor exactly the
way you inject yours.

### ⚠️ The preview needs three files served by YOUR app

The preview runs the learner's code inside `<iframe sandbox="allow-scripts">`
(opaque origin — student code cannot reach your app, its cookies or its
storage). Because that document may not fetch anything at runtime, it loads
three scripts from **your** origin, at absolute paths:

```
/vendor/react.production.min.js
/vendor/react-dom.production.min.js
/vendor/tailwind-play-cdn.js
```

Serve those and the preview works. Don't, and you get an editor, a working
submit, and an empty preview — no error, because a sandboxed iframe cannot
report one. This is the `code` twin of the Tailwind-tokens gap below: a real
host requirement that no test in this repo can go red for.

### Drafts go through the `storage` port

The learner's source is autosaved (debounced, 600ms) under
`` `${CODE_DRAFT_KEY_PREFIX}${activity.id}` `` — `itera.code.snapshot:<id>`.
Omit `storage` and that lands in `localStorage`. Inject it and read, write and
clear all travel together, which is not optional: overriding the write alone
hands the learner back the wrong source on the next open.

Both `CODE_DRAFT_KEY_PREFIX` and `codeDraftKey(activityId)` are exported, so an
adapter that has to translate the key into its own store (the Itera Player
routes it to a per-learner, event-emitting snapshot service) is three lines.

## Dependencies

**Runtime:** `lucide-react`, `framer-motion` — real dependencies, installed with
the package. `sucrase` too, and it is **only ever loaded by `/code`**: it is the
transpiler that turns the learner's single-file JSX into something the preview
iframe can run. A base-only consumer installs it and never imports it, which is
install weight rather than bundle weight — and bundle weight is what ADR-5 is
about. That the base graph cannot reach it is checked mechanically, over the
built `dist/`, by `scripts/assert-entrypoint-isolation.mjs`.

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


The code preview commits each fresh React root with `ReactDOM.flushSync` before
it grades the DOM. This includes the remount before each interaction check.
A frame plus a timer does not guarantee that React committed when its scheduler
callback is delayed. `scripts/test-code-preview-commit.mjs` exercises the real
vendored runtime with a delayed host callback, two isolated click checks, and a
negative selector. The browser CI job runs this regression.
