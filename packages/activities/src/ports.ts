/**
 * The PORTS of `@iterahq/activities` — everything an activity needs from its
 * host, expressed as interfaces the host implements (ADR-3, dependency
 * inversion, of plan `20260803-itera-player-activities-lib`).
 *
 * Today an activity reaches straight into the app: `@/i18n`, `@/api/iteraApi`,
 * `@/auth/AuthContext`, `@/services/artifact.service`. A library cannot do
 * that — it would know the Itera backend's URL, read the Itera session, and be
 * the Itera Player broken in two rather than a reusable unit.
 *
 * THE SIGNATURES BELOW MIRROR THE REAL ONES in `src/api/iteraApi.ts` /
 * `src/api/iteraByoc.ts`, with ONE deliberate change, described next.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE `token` PARAMETER IS GONE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every backend call in the app today takes `token: string`, and every call
 * site gets it the same way: `useAuth().session?.access_token ?? ''`. Carrying
 * that through the port would mean the library handles a credential — it would
 * have to receive it, hold it in React state/props, and hand it back on every
 * call. There is no version of that which is not a credential-handling
 * library.
 *
 * So the host injects ports that are ALREADY BOUND to its own auth. The Itera
 * Player's adapter is a three-line closure over the existing functions:
 *
 *   const api = useMemo<ActivityApiPort>(() => {
 *     const token = session?.access_token ?? '';
 *     return {
 *       listSeeds,
 *       generateContext: (id, seed) => generateContext(id, seed, token),
 *       judge: (id, content, ctx) => judge(id, content, token, ctx),
 *       respond: (input, system) => respond(input, token, system),
 *       generateByoc: (id, seed, regen) => generateByoc(id, seed, token, regen),
 *       readByoc: (id) => readByoc(id, token),
 *     };
 *   }, [session?.access_token]);
 *
 * The package never sees a token, and `identity.authenticated` is all it needs
 * to decide whether calling a port can possibly succeed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY PORT METHOD IS OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-3's consequence: "kinds que dependem de backend degradam explicitamente
 * quando a porta não é fornecida, em vez de estourar". An absent method is the
 * capability probe. It REPLACES `iteraApiConfigured()`, which today reads
 * `import.meta.env.VITE_ITERA_API_BASE` from inside the component tree — a
 * build-time env read that cannot travel into another app's bundle.
 *
 *   before: `iteraApiConfigured()`   after: `Boolean(api?.judge)`
 */
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';

/* ────────────────────────────────── i18n ─────────────────────────────────── */

/** The locales the activity dictionary ships. Mirrors `Locale` in `src/i18n`. */
export type ActivityLocale = 'pt' | 'en';

/**
 * The i18n port — the single largest coupling in the folder (24 imports of
 * `@/i18n`).
 *
 * Only THREE members, and that is a measured claim, not a guess: every
 * `useI18n()` call in `src/components/branded/activity/**` destructures nothing
 * but `t` and `locale`, and `tText` is the bilingual-bag resolver the shared
 * primitives need. `setLocale`, `toggleLocale` and `registerPersistSink` are
 * app concerns (a locale switcher in the header, a DB write) and stay out.
 */
export interface ActivityI18n {
  /** Active locale. The sandbox runtime reducers take this directly. */
  locale: ActivityLocale;
  /** Translate a key, interpolating `{name}` placeholders. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Resolve a bilingual jsonb bag (`{ pt, en }`) for the active locale. */
  tText: (bag: Record<string, string | undefined> | null | undefined) => string;
}

/* ────────────────────────────────── api ──────────────────────────────────── */

/** A seed business domain the learner can pick to contextualize an activity. */
export interface ActivitySeed {
  id: string;
  label: string;
}

/** The AI-generated, contextualized brief. */
export interface ActivityBrief {
  activity_id: string;
  seed: string;
  domain: string;
  scenario: string;
  proposed_er: string;
  prompt: string;
  model: string;
  generation_available: boolean;
}

/** One per-criterion heat-map cell from the judge. */
export interface ActivityJudgeCriterion {
  criterion: string;
  met: boolean;
  note?: string;
}

/** The judge verdict an activity renders. */
export interface ActivityJudgeVerdict {
  result_id: string;
  activity_id: string;
  attempt: number;
  status: 'passed' | 'failed' | 'pending';
  passed: boolean;
  score: number | null;
  feedback: string;
  criteria: ActivityJudgeCriterion[];
  model: string;
  progress_status: 'completed' | 'in_progress';
  judge_available: boolean;
}

/**
 * The free-form AI responder result (BYOC step 1 / sandbox live).
 * `responder_available: false` means the model degraded server-side and
 * `response` is a graceful fallback — not an error.
 */
export interface ActivityResponderResult {
  response: string;
  model: string;
  responder_available: boolean;
  /** Deterministic ground truth: did the learner's context produce a good response? */
  context_good?: boolean;
  /** Human-readable WHY behind `context_good`. */
  reason?: string;
}

/** One BYOC generation, as the host's backend serializes it. */
export interface ActivityByocGeneration {
  generation_id: string | null;
  activity_id: string;
  attempt: number | null;
  seed: string;
  mode: string;
  generated: GeneratedChoiceTree;
  fallback_used: boolean;
  attempts_used: number;
  model: string;
  degraded_reason: string | null;
  /**
   * Why each REJECTED attempt was rejected. `degraded_reason` only survives the
   * terminal failure, so a retry that eventually succeeded would otherwise erase
   * the evidence that the first try was broken. Empty on a clean first attempt.
   */
  attempt_notes: string[];
  created_at: string | null;
  reused: boolean;
  generation_available: boolean;
  persisted: boolean;
}

/** The subset of a brief the judge wants back as context. */
export type ActivityJudgeContext = Pick<
  ActivityBrief,
  'seed' | 'domain' | 'scenario' | 'proposed_er'
>;

/**
 * The backend port. Every method optional — absence is the capability probe
 * (see the header). Implementations are expected to be already authenticated;
 * a rejected promise is a normal, renderable outcome.
 */
export interface ActivityApiPort {
  /** Seed domains for the contextualization picker. Open GET in the Itera impl. */
  listSeeds?: (activityId: string) => Promise<ActivitySeed[]>;
  /** Generate the contextualized brief for a chosen seed. */
  generateContext?: (activityId: string, seed: string) => Promise<ActivityBrief>;
  /** Submit the learner's open-scope artifact for AI judging. */
  judge?: (
    activityId: string,
    content: string,
    generatedContext?: ActivityJudgeContext,
  ) => Promise<ActivityJudgeVerdict>;
  /** The real AI responder — the learner's own input, answered by the model. */
  respond?: (input: string, system?: string) => Promise<ActivityResponderResult>;
  /** Build the BYOC tree from the seed. Idempotent, except under `regenerate`. */
  generateByoc?: (
    activityId: string,
    seed: string,
    regenerate?: boolean,
  ) => Promise<ActivityByocGeneration>;
  /** Read back THIS learner's existing generation, or `null` when there is none. */
  readByoc?: (activityId: string) => Promise<ActivityByocGeneration | null>;
}

/* ──────────────────────────────── identity ───────────────────────────────── */

/**
 * The MINIMUM the activities need to know about who is answering.
 *
 * Measured, not assumed: all three `useAuth()` call sites under
 * `src/components/branded/activity/**` read exactly `session?.access_token`
 * (to authenticate a backend call) and `loading` (to avoid firing a call that
 * would 401 on an empty token). Nothing reads the user's email, id, roles,
 * tenant or provider. So the port carries neither a session nor a token:
 * `authenticated` is the boolean those three sites actually needed.
 */
export interface ActivityIdentity {
  /**
   * The host CAN authenticate a port call right now. Replaces the
   * `Boolean(session?.access_token)` check at every call site.
   */
  authenticated: boolean;
  /**
   * The host's auth is still settling. Activities must not call an
   * authenticated port while this is true. Replaces `useAuth().loading`.
   */
  loading?: boolean;
  /**
   * Opaque learner id, for TELEMETRY CORRELATION ONLY — never for
   * authorization. The library makes no access decision; the host's backend
   * does, from the credential the host bound into the ports.
   */
  userId?: string | null;
  /**
   * Who, besides the learner, can read what the learner produces here.
   *
   * This exists because of a coupling the plan's audit missed:
   * `ArtifactVisibilityNotice` calls `hasTenantAudience()` from
   * `@/services/artifact.service`, which queries Supabase DIRECTLY from inside
   * the activity tree — a second backend dependency, on a different backend
   * than `iteraApi`. A library cannot hold a Supabase client, so the host
   * RESOLVES the fact and passes the answer. Omitted ⇒ `'unknown'` ⇒ the
   * notice stays hidden, which is the component's existing fail-closed
   * behaviour ("never claim a reader exists when we cannot confirm it").
   */
  artifactAudience?: 'none' | 'tenant' | 'unknown';
}

/* ───────────────────────────────── theme ─────────────────────────────────── */

/**
 * Presentation hooks. NOT a theming engine.
 *
 * The activities are styled with Tailwind utilities against the brand tokens
 * that `@devfellowship/components` defines (`evergreen`, `clay`, `obsidiana`,
 * `border`, `card`, …). That package is a PEER DEPENDENCY, so the host owns the
 * Tailwind build and the token values — this port only lets it scope and tune
 * them. A host with no Tailwind pipeline renders unstyled; that is the known
 * risk in the plan, and Fase D is where it gets tested rather than asserted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE IT LANDS — `<ActivityRenderer>`, and only there
 * ─────────────────────────────────────────────────────────────────────────────
 * The three members below are read by `<ActivityRenderer>`, which puts them on
 * ONE element it renders around the kind — the activity root, marked
 * `data-activity-theme="true"`.
 *
 * ⚠️ Until 2026-08-27 this interface was DECLARED AND DEAD. It was documented
 * here and in `CONTRACT.md`, `<ActivityProvider>` memoised it into the context,
 * and no component read it — a host that passed one got silence rather than an
 * error. If you are extending this type, add the reader in the same PR.
 *
 * THE ROOT EXISTS ONLY WHEN A THEME IS SUPPLIED. An unthemed render returns the
 * kind untouched, with no extra element, so every host that passes no `theme`
 * keeps byte-identical DOM. A themed host gains exactly one `<div>`.
 *
 * ⚠️ IT DOES NOT REACH A KIND MOUNTED DIRECTLY. The package also exports each
 * kind (`<ConceptActivity>`, `<QuizActivity>`, …) for a host that lays out its
 * own screen. Those are mounted BELOW the theme root only if the host goes
 * through `<ActivityRenderer>`; a host that mounts a kind on its own scopes the
 * theme itself. Applying it in every kind as well would put the same class and
 * the same custom properties on the DOM twice for the common path, which is a
 * worse trade than one documented limit.
 *
 * The package still ships NO CSS and NO Tailwind plugin. Wiring these three
 * members changed where a value LANDS; it did not make this package own a
 * design system. The token names are the host's, and so are their meanings.
 */
export interface ActivityTheme {
  /**
   * Light/dark intent when the host is not already driving it via a class.
   * Written as `data-appearance` on the activity root, and `'dark'` also adds
   * the `dark` class (every known host runs Tailwind's class strategy).
   *
   * ⚠️ `'light'` CANNOT FORCE LIGHT. Tailwind's class strategy is additive: a
   * package can add `dark` to a subtree, it cannot remove a `dark` an ancestor
   * put on `<html>`. So `'light'` writes the attribute and adds no class — a
   * host inside a dark document stays dark and now has an attribute to write
   * its own rule against.
   */
  appearance?: 'light' | 'dark';
  /** Extra class names on the activity root — the scoping seam. */
  className?: string;
  /**
   * CSS custom properties set INLINE on the activity root, so they cascade to
   * every descendant, beat a stylesheet declaration, and stay scoped to this
   * activity instead of leaking to `:root`.
   *
   * A key that already starts with `--` is used verbatim; one that does not
   * gets the prefix. That forgiveness is deliberate rather than clever: React
   * reads a `style` key without `--` as a CSS PROPERTY name and drops an
   * unknown one without a word, which is the same silent no-op this port spent
   * its first year being.
   */
  tokens?: Record<string, string>;
}

/* ──────────────────────────────── storage ────────────────────────────────── */

/**
 * Draft persistence for in-progress work.
 *
 * Third coupling the plan's table missed: the `code` kind autosaves the
 * learner's source through `@/services/codeSnapshot.service` (localStorage) so
 * a reload does not throw their work away. It is not a backend call, so it
 * never showed up in the `@/api/*` count — but it IS host state, and a host
 * that renders many activities will want to namespace or redirect it.
 *
 * Optional: omitted ⇒ the package's own localStorage default, i.e. exactly
 * today's behaviour.
 *
 * ⚠️ Read, write and clear travel TOGETHER. `UseCodeSnackCallbacks.onAutosave`
 * already documents why overriding only the write side hands the learner back
 * the wrong source on the next open.
 */
export interface ActivityStoragePort {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  clear: (key: string) => void;
}

/* ────────────────────────────── live buffer ──────────────────────────────── */

/**
 * What is ON SCREEN right now, for a host that MIRRORS the learner's surface.
 *
 * PUBLISHING IS NOT PERSISTING, and that distinction is the entire reason this
 * is a second port instead of another write through `ActivityStoragePort`. A
 * draft says *"there is work here"*, so it is deliberately debounced and held
 * back until the first keystroke; the Itera Player's live class measured the
 * consequence on 2026-08-06 — a learner who opened a code exercise and typed
 * nothing was projected to the room as a blank screen, and the instructor had to
 * ask them to "type something" before pulling their work up. Making the draft
 * eager would have fixed the projection by breaking the draft: an untouched
 * starter would be RESTORED over the authored one on the next open, and every
 * idle learner would report as "em andamento".
 *
 * So the two channels answer different questions and both stay honest:
 *   · `storage` — what should survive a reload (the learner's own work);
 *   · this — what is on the screen this instant, work or pristine starter, told
 *     apart by `hasWork` rather than by guessing from the content.
 *
 * Nothing here is expected to be durable. A host is free to keep it in memory
 * and lose it on unload; the Itera Player does exactly that.
 *
 * Optional, and its absence is the capability probe as usual: a consumer with no
 * live class injects nothing and every call is a no-op. Dropping a projection
 * costs that consumer nothing, which is why this may be silently absent while
 * `storage` gets a working default instead.
 */
export interface ActivityLiveBufferPort {
  /**
   * `hasWork` distinguishes *"opened the exercise"* from *"there is work here"*.
   * A source restored from a draft counts as work even though nobody typed
   * during this mount — otherwise a learner who reloads mid-exercise is
   * announced as idle.
   */
  publish: (activityId: string, code: string, hasWork: boolean) => void;
  /**
   * The `terminal_sandbox` screen. A SECOND method rather than a wider `publish`
   * because a terminal's on-screen state is not a source string and never can
   * be: it is a transcript plus where the learner is in the scenario, and a
   * mirror handed a flattened string could show what was typed but not what the
   * sandbox answered — i.e. exactly half of what the viewer pulled it up for.
   *
   * OPTIONAL, so a host that only mirrors code keeps compiling and a terminal
   * simply projects nothing there. Same capability-probe rule as the port
   * itself.
   */
  publishTerminal?: (
    activityId: string,
    screen: ActivityTerminalScreen,
    hasWork: boolean,
  ) => void;
  /**
   * The `chat_sandbox` conversation. A THIRD method, for the same structural
   * reason as the second: a chat's on-screen state is a turn list, and neither a
   * source string nor a terminal transcript can carry it.
   *
   * ⚠️ THIS ONE CARRIES THE LEARNER'S OWN PROSE, and that is a decision, not a
   * side effect. A terminal mirrors TOOL VOCABULARY — `git status` is the same
   * string for everyone who knows the tool. A chat mirrors what the learner
   * WROTE. Putting that on a projector was escalated as a privacy question and
   * approved explicitly (Tainan, TG 2026-08-10, *"sim conserta p otro
   * sandbox"*). The approval is for a MIRROR, so the three constraints that made
   * it a mirror stay enforceable here and are stated where the data leaves the
   * activity:
   *
   *   1. **Ephemeral.** The host is expected to hold this in memory only, exactly
   *      as `ActivityLiveBufferPort` already requires. Nothing here is written to
   *      a database, and nothing is persisted client-side either.
   *   2. **Only on an explicit pull.** Publishing fills a buffer; it does not
   *      transmit. What leaves the learner's tab is the reply to an instructor's
   *      `stage-request`. There is no ambient broadcast of typing.
   *   3. **SENT TURNS ONLY — never the composer.** See `ActivityChatScreen`.
   *
   * OPTIONAL like its siblings: a host that mirrors no chat injects nothing and
   * every call is a no-op.
   */
  publishChat?: (activityId: string, screen: ActivityChatScreen, hasWork: boolean) => void;
  /**
   * The learner left this activity (unmounted, or switched to another one).
   * Without it a mirror keeps projecting the last source of a screen that no
   * longer exists, with no way for the viewer to know.
   */
  forget: (activityId: string) => void;
}

/** One rendered line of a terminal transcript. Mirrors the runtime's `TerminalLine`. */
export interface ActivityTerminalLine {
  kind: 'cmd' | 'out' | 'err';
  text: string;
}

/**
 * The `terminal_sandbox` screen, reduced to what a READ-ONLY mirror needs to
 * redraw it.
 *
 * ⚠️ IT IS A SCREEN, NOT A MODEL. `TerminalModel` also carries `engineState`,
 * the structured `events` and the `RanCommand[]` rail — a judge's trajectory,
 * not a picture. Publishing the model would put the engine's internals on a
 * host's wire and make every future engine field a breaking change to a mirror
 * that never reads it. What travels is what is drawn.
 *
 * The step fields travel WITH the transcript on purpose. A viewer looking at a
 * mirrored terminal sees `git switch -c feature` and has no way to know what was
 * asked; the prompt is the authored instruction the learner has on screen right
 * now, so sending it costs one string and is the difference between a log and a
 * screen.
 */
export interface ActivityTerminalScreen {
  /** The transcript, oldest first: echoed commands AND the sandbox's output. */
  lines: readonly ActivityTerminalLine[];
  /** The shell prompt drawn before each echoed command. Already localized. */
  ps1: string;
  /** Title of the window chrome. Already localized. */
  windowTitle: string;
  /**
   * Indices into `lines` that END a step-completing command — the ✓ marks.
   * Derived by the emitter, not by the mirror: the rule lives in
   * `terminalSuccessMarks` and reproducing it viewer-side would be a second
   * implementation of the same predicate, free to drift.
   */
  successLines: readonly number[];
  /** 0-based step the learner is on; equals `stepCount` once the scenario is won. */
  stepIdx: number;
  stepCount: number;
  /** The current step's instruction, already localized. `null` once finished. */
  stepPrompt: string | null;
  /** The scenario's own `success` predicate is satisfied. */
  won: boolean;
  /** How many commands the learner has run. Zero ⇒ an untouched terminal. */
  commandCount: number;
}

/**
 * One turn of a mirrored chat transcript. Mirrors the runtime's `Message`, minus
 * `quality`.
 *
 * `quality` is dropped ON PURPOSE and it is not a size saving: it is the canned
 * answer's authored grade, and judging weak-vs-strong is the exercise itself
 * (`SandboxBubble` refuses to badge it for the same reason). A mirror that
 * carried it would hand the room the answer to the step the learner is still on.
 */
export interface ActivityChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * The `chat_sandbox` screen, reduced to what a READ-ONLY mirror needs to redraw
 * it. Sibling of `ActivityTerminalScreen`, and IT IS A SCREEN, NOT A MODEL for
 * the same reason: `ChatModel` also carries `slots`, `choicesMade`, `runs`,
 * `evaluations` and `completedSteps` — the judging rail, not a picture.
 *
 * ⚠️ THE COMPOSER IS NOT HERE, AND MUST NOT BE ADDED.
 *
 * The chat sandbox has two different texts on screen, and only one of them is
 * something the learner said:
 *
 *   · `model.messages` — the turns the learner SENT. A finished thought,
 *     addressed to the sandbox, already visible to them as part of a
 *     conversation. That is what travels.
 *   · `useSandboxScenario().inputText` — the composed preview sitting in the
 *     composer, which the learner has picked/filled/typed but NOT sent. That is
 *     a half-formed thought, and mirroring it would project someone thinking.
 *
 * The two are cleanly separable at the source, so the narrower behaviour is the
 * one implemented: no field of this type is ever fed from the composer. The
 * distinction survives review because it is stated here, at the type, and not
 * only at the one call site that fills it.
 */
export interface ActivityChatScreen {
  /** The conversation, oldest first — SENT turns only, never the composer. */
  messages: readonly ActivityChatMessage[];
  /** 0-based step the learner is on; equals `stepCount` once the scenario is won. */
  stepIdx: number;
  stepCount: number;
  /** The current step's instruction, already localized. `null` once finished. */
  stepPrompt: string | null;
  /** The scenario's own `success` predicate is satisfied. */
  won: boolean;
  /**
   * How many prompts the LEARNER has sent. Zero ⇒ the transcript on screen is
   * entirely the authored `seedMessages` opener — on screen, but not work. Same
   * distinction the terminal draws with `commandCount`.
   */
  sentCount: number;
}

/* ────────────────────────────────── sound ────────────────────────────────── */

/**
 * The moments of an interaction that deserve a short cue. A kind names the
 * moment; the host decides which clip, how loud, and whether to stay silent.
 * `correct` and `wrong` are for a kind that shows its own verdict; a kind whose
 * verdict the host already sounds at settle must not call them for that event.
 */
export type ActivitySoundCue = 'pick' | 'connect' | 'drop' | 'correct' | 'wrong' | 'complete';

/**
 * The sound port. Optional: a kind used without it stays silent. Never throws
 * and never awaits; at most one cue per learner action, nothing on hover.
 */
export interface ActivitySoundPort {
  play: (cue: ActivitySoundCue) => void;
}

/* ─────────────────────────────── code editor ─────────────────────────────── */

/**
 * The props a code editor gets from the `code` kind — the whole of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE EDITOR IS A PORT AND NOT A DEPENDENCY
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-5 keeps Monaco out of the base bundle. Fase C step 5 found that keeping
 * it out of the `/code` bundle too is both possible and better, because the
 * Player's editor is not a generic editor: `src/components/editor/CodeEditor.tsx`
 * dispatches a `window` CustomEvent on every caret move so the LIVE CLASS can
 * mirror the learner's cursor to the room, and it configures Monaco's
 * TypeScript worker against this repo's self-hosted vendoring
 * (`scripts/vendor-monaco.ts`, `/vendor/monaco/vs`). Both are Itera Player
 * concerns. Shipping them to every consumer would export a live-session
 * protocol and a build-time asset layout along with the renderers.
 *
 * So the host supplies the editor, exactly the way it supplies i18n and the
 * backend: through `<ActivityProvider>`. Omit it and the `/code` entrypoint
 * renders a plain, dependency-free `<textarea>` surface — a real editor with no
 * syntax highlighting, not a placeholder. See the `/code` README section.
 *
 * The members are MEASURED, not designed: `CodeSnackPane` passes exactly
 * `value`, `onChange`, `language`, `readOnly` and `editableRegions`. The
 * Player's `CodeEditor` takes four more (`highlightLines`, `fontSize`,
 * `remoteCaret`, `semanticValidation`), all optional and all read by the live
 * stage rather than by an activity — which is why it is assignable to this
 * without a shim.
 */
export interface EditableRegion {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface ActivityCodeEditorProps {
  /** The current source. Controlled — the kind owns it. */
  value: string;
  /** Every learner-originated edit. Absent ⇒ the surface is display-only. */
  onChange?: (value: string) => void;
  /**
   * The authored language of the snack (`spec.language`), defaulting to
   * `typescript`. Read by the host's editor to pick its grammar.
   */
  language?: string;
  /** Frozen while a verdict is on screen (see `useCodeSnack.readOnly`). */
  readOnly?: boolean;
  /**
   * The only ranges of `value` the learner may change, derived from the marker
   * comments in the source (`code/editableRegions.ts`). Empty ⇒ the whole file
   * is editable, which is what every activity authored so far gets.
   *
   * Enforcement is the HOST's, because only the host's editor knows what an
   * edit IS: Monaco can reject one range and leave the rest of the file live,
   * while a `<textarea>` only ever reports a whole new string. A host that
   * cannot enforce it ignores the prop and the activity stays playable — it
   * loses the guard rails, not the exercise.
   */
  editableRegions?: readonly EditableRegion[];
}
