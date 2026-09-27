# `@iterahq/activities` — the public contract

**Plan:** [`20260803-itera-player-activities-lib`](https://plans.devfellowship.com/20260803-itera-player-activities-lib)
· **Parent:** `20260803-itera-learning-control-plane-prototipo`
**Status:** Fase A done · Fase B done · **Fase C steps 1–3 done**, **step 4
done for the two sandbox kinds**, **step 5 done for `code`** — pure logic, the
shared primitives, the seven backend-free question kinds, the whole sandbox
(chat + terminal) and the code snack now live here, together with
`<ActivityProvider>` and the package's own `<ActivityRenderer>`. `code` is the
only one behind a SECOND entrypoint (`@iterahq/activities/code`, ADR-5). Still
out: the **AI-judged** half of step 4 (`sandbox-live` · BYOC · `JudgeHeatmap`)
and the three kinds inline in the Player's dispatcher; see *What Fase C left
behind*.
**Source:** `packages/activities/src/`
**Guards:** `src/test/activityPublicContract.test.ts` (surface + prop fit) ·
`src/test/activityDefaultI18n.test.tsx` (dictionary parity) ·
`src/test/activityTraceVocabulary.test.ts` (action names) ·
`src/test/activityHostAdapter.test.tsx` (the shuffle seed really arrives) ·
`src/test/activityEntrypointIsolation.test.ts` (ADR-5, over the built module
graph) · `src/test/codeDraftKeyCompat.test.tsx` (the learner's draft did not
move) · `external-consumer/` (portability, from a packed tarball, in CI)

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
    priorAnswer={savedDetail}              // 1.1.0 — the INVERSE of onComplete
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
| `theme` | Tailwind + `@devfellowship/components` tokens | — | Scoping seam. `<ActivityRenderer>` applies all three members to the activity root — see *The `theme` port*. The package still ships **no CSS and no Tailwind plugin**; the design system is a **peerDependency**. |

### The `theme` port

`<ActivityRenderer>` reads `theme` off the host context and puts it on ONE
element it renders around the kind — the **activity root**, marked
`data-activity-theme="true"`:

| Member | Where it lands |
| --- | --- |
| `className` | verbatim on the root, merged through `tailwind-merge` |
| `tokens` | inline CSS custom properties on that same root |
| `appearance` | `data-appearance`, plus the `dark` class when it is `'dark'` |

```tsx
<ActivityProvider i18n={i18n} theme={{ className: 'acme-activities', tokens: { '--radius': '2rem' } }}>
  <ActivityRenderer activity={row} onComplete={save} />
</ActivityProvider>
```

**The root exists only when a theme is supplied.** With no `theme`, the renderer
returns the kind untouched and there is no extra element — so every host that
does not use this keeps byte-identical DOM. A themed host gains exactly one
`<div>`.

⚠️ **This was declared and DEAD until 2026-08-27.** The interface was documented
here and in `ports.ts`, `<ActivityProvider>` memoised it into the context value,
and no component read it. A host that passed `theme={{ tokens: { … } }}` got
silence — not an error, not a warning, not a changed pixel. It is wired now; the
history is here because the failure mode (a documented port with no reader) is
one this contract can grow again.

Three honest limits, none of them accidental:

1. **`appearance: 'light'` cannot force light.** Tailwind's class strategy is
   additive — the package can add `dark` to a subtree, it cannot remove a `dark`
   an ancestor put on `<html>`. `'light'` writes the attribute and adds no class.
2. **It does not reach a kind mounted directly.** `<ConceptActivity>` and friends
   are exported for a host that lays out its own screen; those get the theme only
   when they are rendered through `<ActivityRenderer>`.
3. **A token is a value, not a meaning.** The package emits nothing that reads an
   `--ia-*` name yet, so today `tokens` reaches whatever the HOST's CSS already
   consumes. Teaching the components to read tokens of their own is the next
   step of `20260827-itera-activities-theming`, not this one.

**Guard:** `src/test/activityThemePort.test.tsx` — each member reaches the DOM,
and a **negative control** asserts that with no `theme` the class is absent, no
custom property is set and no `data-appearance` exists. Without that control the
suite would pass against a component that applies nothing at all.

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

## Replaying a learner's prior answer (`priorAnswer`, 1.1.0)

`activity.status === 'done'` says the learner finished. Until 1.1.0 it never
said WHAT they answered, so a `done` render drew a FRESH activity that was
merely greyed out: no option marked, no verdict, "Enviar" still on screen. A
host that lists past activities in a transcript showed no trace of the learner's
own work — and lost the half that teaches most, which answer they got wrong.

`answerMachine` was right to refuse that render a verdict. Its own comment named
the missing input: *"on a merely-`done` render the learner's real answer is
unknown, and coloring the button green would be a lie."* `priorAnswer` supplies
it.

```tsx
// UP, at the end of the session the learner answered in:
onComplete={(correct, detail) => persist(activity.id, detail)}

// DOWN, on every later render of that same row:
<ActivityRenderer activity={doneRow} priorAnswer={loadPersisted(doneRow.id)} … />
```

### Why this is not the story seam ADR-4 forbids

Plan `20260728-itera-activity-testing`, ADR-4 says *a state reachable by a prop
but not by a real user is a false green*. That rule is intact, and the reasons
are structural rather than a matter of naming:

| The rule asks | The answer |
| --- | --- |
| Is this a new state descriptor? | No. The prop's type **is** `ActivityCompletion` — the second argument of `onComplete`. The contract became symmetric; no new vocabulary was invented. |
| Can a host assert a VERDICT? | No. `ActivityCompletion` has no `correct` field and does not gain one. A host replays the SELECTION; the kind re-grades it with the identical expression a live submit uses. "Pretend this is correct" is not expressible. |
| Can it conjure a state nobody produced? | No. Each kind validates the replayed ids against its own authored spec, and rejects shapes the interaction cannot make — a duplicate pick, a partial `order`, a card paired twice. An unknown id drops the whole payload. |
| Can it settle a fresh activity? | No. `answerMachine` gates the verdict on `done && restored`. Replaying onto a `todo` row seeds the inputs and stops — the learner can still answer. |
| Did the old states get easier to reach? | No. Every interaction test still CLICKS. `src/test/activityPriorAnswerRestore.test.tsx` reaches each state **both** ways in the same file and asserts the two DOMs are equal, which is ADR-4's own test performed rather than argued. |

The honest limit, written down: a host CAN replay a selection that happens to be
correct and get the green render. That is not a false green — it is exactly the
screen a learner who picked that option produces. What ADR-4 forbids is a state
with no such learner, and no payload can express one.

### Per-kind support

| Kind | Restores | Payload it reads (from `actions`' terminal `answer_submitted`) |
| --- | --- | --- |
| `single_choice` | ✅ | `option_ids: [id]` |
| `multi_choice` | ✅ | `option_ids: [id, …]`, in click order |
| `order` | ✅ | `order: [id, …]` — accepted only as a full permutation of the items |
| `match` | ✅ | `pairs: [[left, right], …]` — creation order, which is what numbers the badges |
| `concept` · `concept_reveal` · `video` · `diagram` | n/a | They never grade. There is no answer state to seed, and the prop reaches them harmlessly — asserted, not assumed. |
| `quiz` | ❌ **on purpose** | Its options stay CLICKABLE on a `done` render (`disabled={submitted \|\| reveal}`, deliberately without `done` — see the component). A verdict on a screen the learner can still re-pick would recolour under them, which is a worse render than the one this change fixes. Restoring `quiz` needs that interaction decision revisited first; it is a follow-up, not an oversight. |
| `question` | ✅ | `option_ids: [id, …]` (including the reserved `OTHER` sentinel) + `other: boolean`, **plus the free text from `response`** — the one exception to the rule below, explained under it. |
| `code` · the sandboxes · BYOC | ❌ not yet | Multi-turn or draft-backed. They do not settle on one `answer_submitted`, so the same seam does not fit them unchanged. |

⚠️ **The trace, not `response`.** `ActivityCompletion.response` is a
human-readable summary built from authored LABELS — localized and editable, so
it can never be keyed back to an option. The `actions` trace carries the
AUTHORED IDS the kind grades on, which is why the readers in
`src/internal/priorAnswer.ts` go through it. A host that persists only
`response` cannot replay; persist the whole `detail`.

⚠️ **`question` reads `response` too, and only `question`.** The objection above
is that `response` is a summary built from localized authored LABELS, so it can
never be keyed back to an option. That is exactly right for the graded kinds and
false for this one: a question's `response` is the person's OWN PROSE, verbatim.
Nothing was summarised, no label is involved, and free text has no id to key back
to. It is also the only place the text exists — the trace deliberately carries
`has_text`, never the words (see the privacy rule under *Non-grading kinds*
below). Persist the whole `detail` and both halves come back.

⚠️ **A replay is not an event.** A restored render calls no `onComplete` and
records no action. Nobody did anything.

## Non-grading kinds — `question` (1.2.0)

`question` is the first kind in this package that **never grades**. Everything
below is a property of the kind, not a configuration of it.

| It has no | Because |
| --- | --- |
| `answerMachine` | That machine decides WHEN a verdict may reach the screen. There is no verdict. |
| green / red option state | `recommended_option_id` renders as a muted `★ recomendado` **before and after** the submit. It is what the ASKER leans toward, never a mark against what the person chose. |
| `explanation` | The schema rejects the field. "Why the answer is the answer" presumes an answer. |
| a shuffle | Every other option-bearing kind calls `learnerShuffle`. Here the ORDER IS AUTHORED CONTENT — an asker puts the leading option first, and the plans-app addresses the same options by LETTER. Shuffling would make "option B" mean a different thing per reader. |
| a `reveal` prop | There is no gabarito to expose, so the host's Reveal control would stop a clock and change nothing. |

**The answer is options AND/OR text**, either alone complete. Free text is
available unless the CALLER turns it off — `spec.free_text` only relabels the
field, and no SPEC field switches it off. "Outro" is available unless the caller
turns it off or `allow_other === false`.

### `callerOptions` — the host decides "Outro" and the notes box (1.3.0)

Plan `20260924-activity-type-one-behavior-rule`, T23, Tainan's answer to Q-R2-4
(2026-09-25): *"deixa customizavel pelo caller (ou seja itera-player nunca usaria
isso, mas plans-app consegue 'solicitar' componente dessa forma, com o other)"*.
Free typing beside the options is a second input. An authored spec of a
one-behaviour kind may not ask for it (`question_pick_one` / `_many` refuse
`allow_other` and `free_text` in `@iterahq/activity-spec`). A HOST may ask for
it, because it is a property of the surface, not of the content.

```ts
interface QuestionCallerOptions {
  allowOther?: boolean; // show the "Outro" card
  allowNotes?: boolean; // show the free-text notes box
}
<QuestionActivity activity={…} onComplete={…} callerOptions={{ allowOther: true }} />
```

| Field | Prop given | Prop absent |
| --- | --- | --- |
| `allowOther` | the prop wins, in BOTH directions (it overrides `spec.allow_other`) | `spec.allow_other !== false` — the schema default is `true` |
| `allowNotes` | the prop wins | `true` — the box is shown |

- With `allowNotes: false`, text is no longer a way to answer: the submit needs
  a selection or "Outro", and `response` is `''`.
- A hidden input cannot carry a restored value into the submit: a restored
  "Outro" with `allowOther: false` is not submitted.
- `resolveQuestionInputs(spec, callerOptions)` is the rule as a pure function,
  exported so an adapter resolves it the same way.
- **The Itera Player never passes the prop.** `ActivityRenderer` does not
  forward it, so every learner surface keeps the spec behaviour.

### `QuestionActivityBody` — the same body, controlled (1.3.0)

`QuestionActivity` is uncontrolled and submit-driven. A host whose chrome owns
the state and the save (the plans-app: live `Salvar`, quick-answer chips,
`[]`-deselect) draws `QuestionActivityBody` instead. It renders the pick hint,
the option cards, the `★ recomendado` marker, "Outro" and the notes box, owns
NO state, and never submits. `QuestionActivity` renders through it, so the two
cannot drift.

| Prop | Meaning |
| --- | --- |
| `options: { id, label?, description? }[]` | authored order; `id` is what `onToggle` reports (a plans-app letter works) |
| `multi` | pick any number vs pick one (drawing only — the caller applies the toggle rule) |
| `recommendedIds?` | ids with the `★ recomendado` marker |
| `selected` | selected ids, INCLUDING `QUESTION_OTHER_ID` when "Outro" is on |
| `notes`, `onNotesChange` | the notes text |
| `onToggle(id)` | a tap on an option or on "Outro" (`QUESTION_OTHER_ID`) |
| `callerOptions?`, `specAllowOther?` | the precedence rule above |
| `disabled?`, `notesLabel?`, `notesPlaceholder?`, `notesRows?`, `otherLabel?`, `fieldId?` | presentation |

### What `onComplete` hands up

```
onComplete(true, {
  response: '<the free text, verbatim>',
  actions: [ …, { type: 'answer_submitted',
                  payload: { option_ids, other, has_text } } ],
})
```

`true` is **not a verdict** — `ActivityCompleteHandler` requires a boolean and a
settled non-grading activity is a completed one, the same value the reflection
`document` passes. No screen in the kind reads it.

🚨 **The free text is in `response` and NOT in the trace payload, by rule.** The
host's `PAYLOADS_CARRY_NO_FREE_TEXT` states it: *a trace payload carries WHICH
thing the learner touched and WHEN, never WHAT they wrote* — the answer text has
one home, and a second copy is two places to keep in step and two places to
purge. A question's prose is exactly that category. The terminal sandbox's
`command_run.command` carve-out does not extend to it: that one rests on a shell
command being TOOL VOCABULARY, and its own note says *"a terminal has no answer
text."*

The two halves map 1:1 onto the plans-app persistence contract, which is what
makes the adapter a rename rather than a translation:

| `question` | plans-app |
| --- | --- |
| `option_ids` | `selected_option_letters[]` |
| the `OTHER` sentinel inside it | the reserved `OTHER` sentinel |
| `response` | `freeform_notes` |

### Its own family: `inquiry`

The host files it under a NEW reducer family (`src/utils/activityFamilies.ts`)
rather than under `selection`, and the file's own falsifiable criterion is what
decides it: *adding a kind inside an existing family must cost data plus
predicates; if it costs a new state machine, the boundary is wrong.* It costs
one — no verdict, plus two axes (`other`, the text draft) no selection kind has.

The action names are deliberately distinct (`option_marked` / `option_unmarked`,
not `option_selected` / `option_deselected`): in `selection` a learner marks the
option they believe is CORRECT, here a person states a position on something
that has no correct answer.

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
   `multi_choice`, `match`, `order`. ✅ **Done** (Fase C steps 1–3.) Plus
   `document`/`diagram`/`quiz`, which had to be **lifted out of
   `ActivityRenderer.tsx` into their own files first** because they were inline
   functions in the 700-line dispatcher. ✅ **Done in Fase D** — see finding 4.
4. **Backend-backed kinds** — the sandboxes, BYOC, the AI-judge `document`
   path, `JudgeHeatmap` → all go through the injected ports.
5. **Heavy kinds** — `code` / the preview iframe → separate entrypoint
   `@iterahq/activities/code` (ADR-5), never in the base bundle. ✅ **Done.**
   Monaco did NOT come along: the editor became a port (see finding 6).
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
| `single_choice` | ✅ | `i18n` | Restores a prior answer (1.1.0). |
| `multi_choice` | ✅ | `i18n` | Restores a prior answer (1.1.0). |
| `match` | ✅ | `i18n` | Restores a prior answer (1.1.0). |
| `order` | ✅ | `i18n` | Restores a prior answer (1.1.0). |
| `document` | ✅ | `i18n`; optionally `api.listSeeds`/`generateContext`/`judge` + `identity` | **THREE** paths, not two: read-only · reflection · AI-judge. Extracted in Fase D. The AI-judge path is selected by `Boolean(api?.judge)` — absence degrades to reflection, so a judge-less host still shows a working activity. Also mounts `ArtifactVisibilityNotice` → see finding 1, now closed. |
| `diagram` | ✅ | `i18n` | Extracted in Fase D. ⚠️ Its image field is `imageUrl` (camelCase), unlike the InstructionPanel's `image_url` — both spellings are live in production and neither is a typo. |
| `quiz` | ✅ | `i18n` | Extracted in Fase D. **Does NOT restore a prior answer** — its options stay clickable on a `done` render, so a replayed verdict would recolour under the learner. See the `priorAnswer` section. The one kind whose trace keys on the option INDEX — its options carry no required id, and it is also the one kind that does not shuffle, so the index IS the authored position. A quiz that ever starts shuffling must grow authored ids in the same change. |
| `chat_sandbox` · `terminal_sandbox` (self-paced) | ✅ | `i18n` | Judging is `@iterahq/activity-spec/runtime` — pure, no backend. |
| `chat_sandbox` (live/BYOC) | ✅ | `i18n`, `api.respond`/`judge`, `identity` | Reached via `LiveActivityRenderer`, not `ActivityRenderer` → see finding 3. |
| `code` | ✅ | `i18n`, **`storage`**, optionally `codeEditor` | Behind the `/code` entrypoint (ADR-5). Monaco is NOT in the package — the editor is a port, and without one the kind draws a plain textarea → see findings 2 and 6. |
| BYOC (a **layer**, not a kind) | ⚠️ one extra prop | `i18n`, `api.generateByoc`/`readByoc`, `identity` | `ByocActivity` takes `spec` in addition. It is a dispatcher-internal handoff (`resolveByocSpec` runs *before* the kind switch), never something a host supplies — so the public surface is unchanged. Asserted explicitly so a *second* extra prop turns the test red. |

**Verdict: the contract covers every kind.** The seven things worth flagging are
below — none of them require bending the contract, but three of them mean the
plan's coupling table was incomplete, and findings 5–7 arrived with step 5.

## Findings — where reality disagreed with the plan

1. **A second backend, missed by the audit.** `ArtifactVisibilityNotice`
   (mounted inside the `document` reflection path) calls `hasTenantAudience()`
   from `@/services/artifact.service`, which queries **Supabase directly** from
   inside the activity tree. The plan's coupling table counted only
   `@/api/iteraApi`, so this never appeared. A library cannot hold a Supabase
   client, so the host resolves the fact and passes the answer:
   `identity.artifactAudience`. Omitted ⇒ `'unknown'` ⇒ the notice stays
   hidden, which is exactly the component's existing fail-closed behaviour.

   ✅ **Closed in Fase D**, with the component. One thing changed that the
   finding did not predict: the resolution moved from **per document activity
   mounted** to **once per authenticated session**, in `IteraActivityHost`. That
   is strictly fewer queries, not more — and it is gated on `authenticated`, so
   an anonymous visitor now makes none at all where they used to make two per
   reflection card.

2. **The `code` kind needs a storage port.** `useCodeSnack` autosaves the
   learner's source through `@/services/codeSnapshot.service` (localStorage) so
   a reload does not discard their work. Not a backend call, so it did not show
   up in the `@/api/*` count — but it is host state. Optional port, defaulting
   to localStorage (today's behaviour). ⚠️ Read/write/clear must move together;
   `UseCodeSnackCallbacks.onAutosave` already documents why overriding only the
   write side hands the learner back the wrong source.

   **Closed in step 5, and the postscript is the interesting part:**
   `onAutosave` — the write-only override whose own comment warned against
   itself — had **zero call sites**. `CodeSnackPane` only ever passed
   `onComplete`. So the half-measure left with the move instead of being carried
   into the package's public surface, and what replaced it is the whole port.
   The compatibility risk is the opposite direction and it is real: the package
   mints its own key, so `ITERA_ACTIVITY_STORAGE` in `IteraActivityHost.tsx`
   translates it back to the Player's scoped one. Get that wrong and every draft
   on every lab machine becomes unreachable **without a single error** — which is
   why `src/test/codeDraftKeyCompat.test.tsx` asserts the literal on-disk key,
   the envelope, and the DOM event, from a real render.

3. **There are two dispatchers, and only one is in scope.**
   `LiveActivityRenderer` wraps `ActivityRenderer` with the same props plus
   `forceLive`, and it — not `ActivityRenderer` — is what routes the live BYOC
   sandbox. Its live branch is gated on `iteraApiConfigured()`, an
   env read. Under the contract that gate becomes `Boolean(api?.respond)`. The
   wrapper itself looks like **host routing, not an activity**, so the working
   assumption is that it stays in the Player and the package exports the live
   variant as a kind the base dispatcher can reach. Confirm before Fase C step 4
   — getting it wrong drags live-class concerns into the package.

4. **`document` / `diagram` / `quiz` were not files.** They were inline
   functions inside `ActivityRenderer.tsx`, and that lift was the one step in
   the whole extraction that touches the dispatcher every other open PR also
   touches — so it was sequenced last, when the queue drained.

   ✅ **Closed in Fase D**, and the interesting part is what it cost the file
   they came out of: `ActivityRenderer.tsx` went from ~700 lines to ~180, and
   what is left is exactly the three things ADR-1 keeps in the host — the BYOC
   layer resolution, the fail-closed spec-validation boundary, and the kinds
   that have not crossed. **The Player now runs a second kind switch that
   parallels the package's**, which is a debt this document should not lose:
   a second switch that agrees today disagrees later, silently, for one kind.
   When the last un-extracted kind crosses, the Player's dispatcher should
   DELEGATE rather than keep its own switch.

   The extraction also carried the `document` kind's env read across, and it
   changed shape doing so: `iteraApiConfigured()` — a build-time
   `import.meta.env` read — became `Boolean(api?.judge)`. That is not a
   refactor for tidiness. Compiled into a package, the env read reports on the
   machine that BUILT the library, so it would have answered `false` for every
   consumer forever. `IteraActivityHost` now withholds the whole `api` object
   when the base URL is unset, which is what makes the runtime probe give the
   same answer the build-time one used to.

5. **The `code` kind is not self-contained, and no test in this repo can go
   red for it.** The preview iframe is a document that must not fetch anything
   at runtime, so it loads `/vendor/react.production.min.js`,
   `/vendor/react-dom.production.min.js` and `/vendor/tailwind-play-cdn.js` from
   the HOST's origin, at absolute paths. In this repo those are `public/vendor/`
   assets produced by a vendoring script; in any other consumer they are a setup
   step nobody is told about until the preview silently renders nothing — a
   sandboxed iframe cannot report a failed subresource to its parent. Documented
   in the README rather than fixed, because the alternatives (a fourth port for
   a base path, or inlining ~150 KB of React into a string) both cost more than
   a paragraph. Same shape as *"design tokens não viajam"*: a real host
   requirement, asserted nowhere.

6. **The editor could not travel, and finding that out is what shaped step 5.**
   The plan's coupling table listed `@/components/editor/CodeEditor` under
   "Monaco + sandbox iframe → isolate in an optional entrypoint (weight)". Weight
   was the smaller half of the problem. That component ALSO dispatches a `window`
   CustomEvent on every caret move — the channel the live class uses to mirror a
   learner's cursor onto the professor's stage — and configures Monaco's
   TypeScript worker against this repo's self-hosted vendoring (`/vendor/monaco/vs`).
   Neither is a rendering concern; both are Itera Player concerns that ADR-1
   keeps out of an activity.

   So the editor became a **port** (`ActivityHostContext.codeEditor`) rather than
   a dependency, and the package ships **no editor at all** — not even a lazily
   imported optional peer, which would have been a "default" that only renders in
   a host that separately installed it. The fallback is a plain `<textarea>`: a
   working editing surface minus syntax highlighting. Two things follow, and both
   are better than the alternative:

   · ADR-5's guarantee is now STRUCTURAL. There is no arrangement of dynamic
     imports for a future edit to get wrong, because there is nothing to import.
     `scripts/assert-entrypoint-isolation.mjs` walks the built module graph from
     each entrypoint and asserts the shape both ways — the base reaches nothing
     under `code/`, and `/code` DOES reach the transpiler, which is what stops a
     broken walker from reporting a vacuous green.
   · the external-consumer harness can drive a code snack end to end. Monaco
     cannot render in jsdom; a textarea can, so "a consumer can render AND answer
     a `code` activity" is now proven from outside the repo rather than asserted.

7. **`spec.language` is read by nobody.** `CodeSpecSchema` has carried a
   `language` field (default `"tsx"`) since the kind existed, and
   `CodeSnackPane` has always hardcoded `language="typescript"` on the editor.
   The seam made it visible — the port's prop interface has a `language` member,
   and wiring it meant looking at where the value comes from. It is **not fixed
   here**: step 5 may not change behaviour, and forwarding the field naively
   would send `"tsx"` to Monaco, which has no such language id, silently
   unstyling every authored snack. The fix needs an audit of the authored
   content plus a mapping, and it is its own PR.

Also worth recording, though not a contract problem: the app's `Activity` type
carries `lessonId`, `ordinal`, `publishStatus` and `artifactPolicy`, and **no
renderer reads any of them** — a grep of `activity.<field>` across the folder
returns only `spec`, `status`, `id`, `kind`, `rubric`. `PortableActivity` asks
for those five. The Player passes its existing rows unchanged (the guard asserts
`Activity` is assignable to `PortableActivity`); the reverse is deliberately
false, because making it true would drag the Itera content model into the
package, which is what ADR-1 refuses.

## One activity type = one behaviour (fleet rule, 2026-09-24)

**Plan:** [`20260924-activity-type-one-behavior-rule`](https://plans.devfellowship.com/20260924-activity-type-one-behavior-rule)
(v3, ADR-1…ADR-5, task T2). **Source:** Tainan, TG 2026-09-24 msg 19287:
*"dentro do repo é OK/ESPERADO reusar os componentes / mas daí deixar um
activitytype diferente SEMPRE q comportamento for diferente / tipo drag and drop
VS type / e o resto tudo igual / tem q ser 2 Activity Type"*.

**One activity type = one behaviour. The TYPE is the contract. Components are
shared freely.** Two kinds can render with the same component. One kind cannot
hold two behaviours. The same rule is in `iterahq/activity-spec` (`README.md` +
`src/kinds.ts`), which is the registry.

### What a behaviour is

A behaviour is a tuple of four axes. If an author-controlled field changes ANY
axis, the result is a different type:

| Axis | The question | Examples of a DIFFERENT behaviour |
| --- | --- | --- |
| B1 — input method | What does the learner physically do? | type vs drag a chip vs pick from a dropdown vs tap pairs vs converse vs a gesture |
| B2 — grading | Who or what decides correct? | none vs answer-key lookup vs text match vs DOM checks vs word count vs AI judge |
| B3 — completion | What event finishes it? | view vs submit vs gesture gate vs all steps unlocked |
| B4 — step pattern | In a multi-step kind, does the type fix the step sequence? | a step whose input method the author picks per step |

A **presentation variant** can stay a prop: copy, i18n, theme, layout, size,
media (image vs mermaid), number of options, shuffle, the timer layer, the code
language or runtime when B1–B3 do not change, and an accessibility alternative
input that is ALWAYS present (like the drag AND up/down buttons of `order`).

Two more rules close the loopholes:

- **No shape-sniffing.** A renderer must not pick a sub-renderer from the
  presence of a field (`slots?.length`, `blanks?.length`). That is a hidden
  discriminator. Put the difference in the kind.
- **No host-dependent behaviour.** A kind must not become a different behaviour
  when a host port is absent (the transition kind `document` with an AI-judge
  rubric still becomes a reflection when `api.judge` is absent; the new kind
  `document_ai_judge` does not). A missing port shows the kind's
  explicit "unavailable" state (ADR-3 above: degrade explicitly).

**The one-line test:** *"If an author flips this field, does the learner do
something different with their hands, does a different judge decide, or does a
different event finish it?"* Yes → a new type.

Multi-step kinds use ONE input for every step (plan ADR-3). A ramp such as pick
a command → build a command → type a command is a SEQUENCE of activities in the
lesson, not one activity. This reverses the per-step ramp of `terminal_sandbox`
(answer tsq2 = C of 2026-08-06).

### Components are shared freely

This rule is about the TYPE, not about the code. Reuse the same React component
under two or more kinds (for example, the guided-code view in
`src/code/guided/` under `code_fill_bank`, `code_fill_select` and
`code_fill_type`). The new kind maps to
the component that already renders it, with a fixed prop. It does not read the
spec to choose. Do not copy a component to make a kind look separate.

### The transition list

These ids break the rule today. They stay VALID on read and on write during the
transition, and they are DEPRECATED. A kind leaves the write path only after
`db/scripts/audit-activity-behaviours.sql` shows 0 rows on it (plan T20). Do not
add a row to a kind on this list. Do not add a new kind that holds more than one
behaviour.

| Old id (deprecated) | Behaviours inside it today | New kinds (plan ADR-1) |
| --- | --- | --- |
| `code` | open editor graded by DOM `checks` · open editor with no grading · guided blanks by bank / select / text | `code_editor_checks` · `code_editor_ungraded` · `code_fill_bank` · `code_fill_select` · `code_fill_type` |
| `chat_sandbox` | open chat · fill slots (select or text) · pick a context chip · per-step `mode: compose \| evaluate` | `chat_compose` · `chat_fill_select` · `chat_fill_type` · `chat_pick_context` · `chat_rate_reply` |
| `terminal_sandbox` | type a command (`freeText`) · pick from a palette (`options`), per step whole command vs tokens | `terminal_type_command` · `terminal_pick_command` · `terminal_build_command` |
| `document` | read · reflection with a word count · AI-judged writing | `document_read` · `document_reflect` · `document_ai_judge` |
| `question` (not stored) | `mode: single \| multi` · 'Outro' free typing next to the options | `question_pick_one` · `question_pick_many` · `question_write` |
| `spec.byoc` on a host kind (a layer, not a kind) | `pick_best` · `judge_each` · `build_context` | `byoc_pick_best` · `byoc_judge_each` · `byoc_build_context` (plan ADR-4) |

`sandbox_scenario` is already retired to 0 rows (see the repository
`CLAUDE.md`). During the transition, an old kind keeps its shape-sniffing branch
in the renderer. No NEW branch of that type is allowed. The three `question_*`
kinds get no database label: nothing stores `question`.

### The renderers of the new kinds (1.4.0, plan T9–T14)

Every new kind maps to the component that already rendered its behaviour, with
the input PINNED by the kind. No new kind reads the spec to choose a screen.

| Kind | Component (shared) | What the kind pins |
| --- | --- | --- |
| `code_editor_checks` · `code_editor_ungraded` | `CodeSnackPane` (`/code` entrypoint) | the open editor; `checks` required / refused |
| `code_fill_bank` · `code_fill_select` · `code_fill_type` | `GuidedCodePane` (`/code` entrypoint) | every blank is `bank` / `select` / `text` |
| `chat_compose` · `chat_fill_select` · `chat_fill_type` · `chat_pick_context` | `SandboxScenarioShell` | the compose panel (`ai` / `words` / `words` / `options`); every step `compose` |
| `chat_rate_reply` | `SandboxScenarioShell` + ONE seeded run | every step `evaluate`; the author's fallback reply is on screen before any send (`seedFallbackRun`, activity-spec #57, T25) |
| `terminal_type_command` · `terminal_pick_command` · `terminal_build_command` | `TerminalSandboxShell` | `freeText` / `options` + `command` / `options` + `token`, for EVERY step |
| `document_read` · `document_reflect` · `document_ai_judge` | the read card / `ReflectionDocumentActivity` / `AiJudgeDocumentActivity` | the judge: none / word count (`evaluation.minWords`, else `rubric.min_words`) / the AI |
| `question_pick_one` · `question_pick_many` · `question_write` | `QuestionView` (the body of `question`) | one pick / many picks / free text; no "Outro", no `callerOptions` |
| `byoc_pick_best` · `byoc_judge_each` · `byoc_build_context` | the Player's BYOC runtime (not in this package) | ONE `harness.interaction` |

**No host-dependent behaviour, enforced:** `document_ai_judge` without
`api.judge` renders `document-ai-judge-unavailable` and emits
`port.unavailable` (`reason: 'no-judge-port'`). It never falls back to the
reflection. The Player's `byoc_*` kinds render `byoc-unavailable` without the
itera-api, never the host `concept` card.

**Validation.** Each kind component renders through `KindSpecGate`: a spec that
does not fit the kind is an inert card with testid `<kind-with-dashes>-invalid`
(`kindInvalidTestId`). The Player validates the same kinds at its boundary
first, with the same testid.

**Before `@iterahq/activity-spec` 1.4.0 is published.** The 22 names are
mirrored in `src/oneBehaviourKinds.ts` (`ONE_BEHAVIOUR_KINDS`, byte-identical to
activity-spec #55). `safeParseKindSpec(kind, spec)` asks the INSTALLED spec
first; for a new kind the installed spec does not know, it parses under the
transition parent and applies the kind's one narrowing
(`ONE_BEHAVIOUR_FALLBACK`). On spec `^1.4.0` the real Zod schemas answer and the
fallback is dead code; `KnownActivityKind` (`ActivityKind | OneBehaviourKind`)
collapses into `ActivityKind`. `oneBehaviourKinds.test.ts` runs the fallback and
the installed spec on the same positives and mutations, so the bump cannot
change which rows render without a red test. `seedFallbackRun` has the same
seam: the runtime's own function when it exports it, an exact equivalent
before.

### What a new kind costs

A new kind is one behaviour. It gets one `*.stories.tsx` file (title
`Activities/<family>/<kind>`), one row in `src/test/activityMatrixCoverage.test.ts`,
and a registry entry in `@iterahq/activity-spec`. Stories inside the file are
STATES and presentation variants only. The PR template carries the checklist
(plan T7). `@taigfs` reviews every new kind (plan ADR-5, T8).

## Decisions already locked — do not relitigate

| ADR | Decision |
| --- | --- |
| ADR-1 | Export at **activity** level. No bottom bar, progress, hearts or routing. |
| ADR-2 | **npm workspaces**, not Turborepo. |
| ADR-3 | Dependency inversion — the host injects ports; the package never fetches and never reads a session. |
| ADR-4 | `onEvent` ships in v1 with an open payload. |
| ADR-5 | `code` behind `@iterahq/activities/code`, not the base bundle. Step 5 went one better and kept Monaco out of the package entirely — the editor is a port (finding 6). |
| — | `@devfellowship/components` is a **peerDependency** (plan Open Question 3). |
| ADR-6 | Package is **PRIVATE** — DFL/Itera IP. Registry: **GitHub Packages** under the `iterahq` GitHub org (2026-08-04; npm free orgs can only publish public). |


---

# Fase C — what moved, how the couplings were broken, what is left

**Date:** 2026-08-07

## What moved

| Step | Files | Now at |
| --- | --- | --- |
| 1 — pure logic | `answerMachine`, `seededShuffle`, `richText` + `richTextInline`, `localizedText`, the action recorder, the activity spec types | `packages/activities/src/internal/`, `src/specs.ts` |
| 2 — primitives | `RichSpans`, `RichBlock`, `RichText`, `InstructionImage`, `InstructionPanel`, `AnswerExplanation`, `parts` (`ActivityShell` · `KindBadge` · `DoneButton` · `SubmitButton`) | `packages/activities/src/components/` |
| 3 — backend-free kinds | `concept`, `concept_reveal`, `video`, `single_choice`, `multi_choice`, `match`, `order` | `packages/activities/src/kinds/` |
| 4 — the sandbox | `chat_sandbox` · `terminal_sandbox` and their five activity types: `sandbox/` and `terminal/` whole | `packages/activities/src/kinds/sandbox/`, `.../kinds/terminal/` |
| 5 — the heavy kind | `code`: `CodeSnackActivity` → `CodeActivity`, `CodeSnackPane`, `CodeLivePreview`, `CodeChecksFeedback`/`List`, `CodeResetControl`, `useCodeSnack`, `useCodeChecks`, `transpileSnack`, the preview iframe document and its check runtime | `packages/activities/src/code/` — behind `exports["./code"]`, **not** the base barrel |
| new | `<ActivityProvider>` + the package's own `<ActivityRenderer>` + the activity dictionary | `src/context.tsx`, `src/ActivityRenderer.tsx`, `src/i18n/` |

The app keeps a **one-line re-export at every old path**, which is what the plan
asked for (*"o app vira consumidor: `src/components/branded/activity/*` é
deletado e re-exportado do pacote"*). Consequence worth stating: `ActivityRenderer.tsx`,
the stories, the harnesses and ~15 test files did not change at all, so
"did the move change behaviour?" is not entangled with "did the rename change
behaviour?".

## How each host coupling was broken

| Coupling | Before | After |
| --- | --- | --- |
| `@/i18n` (28 imports) | `useI18n()`, throws outside its provider | `useActivityI18n()` off `ActivityHostContext`. The Player passes `useI18n()` verbatim through `IteraActivityHost`. |
| `@/hooks/useActionRecorder` | generic over `FamilyAction<F>` from Itera's taxonomy | generic over a plain string union in the package; the app's hook is a typed wrapper, and `activityTraceVocabulary.test.ts` asserts the names still line up |
| `@/utils/learnerShuffle` → `currentStorageScope()` | read the Itera user id from `localStorage` | `identity.userId` on the port |
| `@/types/content` | spec shapes lived beside the Itera content model | spec shapes are in the package; `Activity`/`Lesson`/`Unit`/`Program` stay in the app and `content.ts` re-exports the half that moved |
| `@/services/codeSnapshot.service` (step 5) | `useCodeSnack` read/wrote/cleared the learner's draft directly, per-learner scoped, firing a DOM event the live class listens to | `useActivityStorage()` off the port. `ITERA_ACTIVITY_STORAGE` in `IteraActivityHost.tsx` translates the package's key back to the Player's, so the on-disk key, the `{code, savedAt}` envelope and `CODE_SNAPSHOT_EVENT` are all unchanged — pinned by `codeDraftKeyCompat.test.tsx` |
| `@/components/editor/CodeEditor` (step 5) | Monaco, imported by `CodeSnackPane`, carrying the live-class caret CustomEvent and this repo's TS-worker configuration | `ActivityHostContext.codeEditor`. The package ships no editor and falls back to a `<textarea>`; the Player injects the same component it always had, and both Itera-specific behaviours stay in the app |

### The coupling the plan's audit missed

The plan's table counted `@/i18n`, `@/api/iteraApi`, `@/auth/AuthContext` and
"pure logic". **`learnerShuffle` was in the pure column and was not pure**: it
called `currentStorageScope()`. That one matters more than its size, because of
how it fails. A missing i18n port renders translation keys — loud, obvious,
caught by any smoke test. A missing learner scope renders *perfectly*: every
learner in the consuming app falls back to one per-browser anonymous id, each
still sees a stable order, nothing throws, and the only thing that stops being
true is the reason the shuffle exists at all.

That is the shape of coupling worth hunting for in steps 4–5: not the import
that breaks the build, but the host read whose absence still renders.

### Step 4 split in two, and the reason is worth writing down

The plan groups step 4 as *"kinds com backend — SandboxScenario, Byoc, Judge\* →
passam pelas portas injetadas"*. Executing it showed the grouping is wrong for
one of its three members: the self-paced sandboxes **have no backend**.
Their entire world model — `runCommand`, `sendPrompt`, `evaluate`, `isSuccess` —
is pure reducers in `@iterahq/activity-spec/runtime`, and the only thing they ever
asked the Player for was `useI18n()` and the action recorder.

The audit table in the plan put it in the backend column because its *live twin*
(`SandboxScenarioLiveActivity`, reached through `LiveActivityRenderer`, not
through `ActivityRenderer`) calls `respond` and `judge`. Two components, two
files, one kind name. Finding 3 of this document already flagged that split; step
4 is where it became load-bearing.

The practical consequence is good news for a host: the richest kind the package
ships — N turns, a world model, per-step gating, its own success predicate — is
also one of the ones that needs **nothing injected but i18n**.

## What Fase C left behind, and why

| Not moved | Reason |
| --- | --- |
| ~~the sandboxes~~ | ✅ **MOVED** in step 4 (`chat_sandbox` + `terminal_sandbox`, five activity types). They turned out to be the half of step 4 that needs **no port at all** — see the note below. |
| `sandbox-live`, BYOC | The AI-judged surfaces that consume `api.respond` / `api.generateByoc` and read `identity.authenticated`. BYOC had ~10 of its 12 files open in PR #296 while step 4 landed, and `sandbox-live` is in PR #285 — extracting under an open rewrite produces a conflict, not an extraction. |
| ~~`JudgeHeatmap`~~ | ✅ **MOVED** in Fase D, with the AI-judged `document` — which was its only production caller, so the reason it was waiting ("no reason to move before its callers do") expired the moment `document` crossed. It is the first thing in the package to consume the `api` port for real. |
| ~~`code` / the preview iframe~~ | ✅ **MOVED** in step 5, into `@iterahq/activities/code` — the second entrypoint, absent from `BUILT_IN_ACTIVITY_KINDS` on purpose. |
| Monaco (`src/components/editor/CodeEditor.tsx`, `monacoTypescript.ts`) | Stayed, and step 5 is why: it carries the live-class caret CustomEvent and this repo's self-hosted Monaco/TS configuration. The editor is a PORT now — see finding 6. |
| `codeSnapshot.service`, `CodeSnapshot` | The Player's on-disk draft store: per-learner scoped key, `{ code, savedAt }` envelope, `CODE_SNAPSHOT_EVENT` for the live "em andamento" indicator. The package speaks plain strings through `ActivityStoragePort`; shipping the envelope would be the package dictating how every consumer stores a draft. |
| `document`, `diagram`, `quiz` | Finding 4: they are inline functions inside the Player's 700-line dispatcher, which every open PR touches. Lifting them out is its own PR, sequenced when the queue drains. |
| `FeedbackFooter` | It is the **global viewport-fixed** footer, mounted by `LessonPlayer` and `LiveSessionPage`. ADR-1 puts it on the player side of the line. `activityFeedbackKinds.ts` (`FOOTER_GRADED_KINDS`) is footer-routing policy and stays with it. |
| `LiveActivityRenderer` | Finding 3: host routing, not an activity. |
| ~~`ArtifactVisibilityNotice`~~ | ✅ **MOVED** in Fase D, with `document`, behind `identity.artifactAudience` exactly as planned. See finding 1. |
| `ActivitySkeleton`, `InvalidSpecCard` | Player-side loading and validation-failure chrome; the package draws its own unsupported-kind placeholder. |
| `activityFamilies.ts`, `learningTrace.ts` | Itera's telemetry taxonomy and trace builder. Shipping them would hand every consumer Itera's event model. |

## Two dispatchers, on purpose (and temporarily)

The package has its own `<ActivityRenderer>`; the Player kept its own. They are
not the same component and neither is a copy of the other — the Player's one
also validates specs, resolves the BYOC layer and routes live-vs-self-paced, all
of which are host concerns the package refuses.

The honest cost: until the Player consumes the package's dispatcher, *"the app
is a consumer"* is true of the **renderers** and not yet of the **dispatch**.
Closing that is the same PR that lifts `document`/`diagram`/`quiz` out — which
is finding 4's PR, waiting on the same queue.
