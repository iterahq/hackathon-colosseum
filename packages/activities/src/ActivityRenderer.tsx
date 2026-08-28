/**
 * `<ActivityRenderer>` — the package's public entry point: one activity row in,
 * one rendered micro-experiment out.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A NEW FILE AND NOT A MOVE OF THE PLAYER'S DISPATCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * The Player has its own `src/components/branded/activity/ActivityRenderer.tsx`
 * (~700 lines). It was NOT moved, for two reasons that are both about honesty
 * rather than effort:
 *
 *  1. Most of it is not dispatch. It carries spec VALIDATION
 *     (`activitySpecBoundary`) and the BYOC layer resolution — both of which
 *     belong BEFORE a renderer, not inside one.
 *
 *     It also carried three kinds (`document`, `diagram`, `quiz`) written as
 *     inline functions rather than files. **That is no longer true as of Fase
 *     D**: they are `./kinds/DocumentActivity.tsx`, `./kinds/DiagramActivity.tsx`
 *     and `./kinds/QuizActivity.tsx` here, and the Player's copies are one-line
 *     re-exports. `CONTRACT.md` finding 4 said to sequence that when the queue
 *     drained; it drained enough.
 *  2. A host does not want the Player's dispatch. Validation belongs before the
 *     renderer (`ActivityRendererProps.activity` is documented as already
 *     validated); live/self-paced routing is player chrome, which ADR-1 keeps
 *     out.
 *
 * So this dispatcher does exactly one thing — pick a component for a kind — and
 * the Player keeps its own for now. That is a real cost and it is written down
 * rather than hidden: until the Player consumes this one, "the app is a
 * consumer" is true of the RENDERERS and not yet of the DISPATCH.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT SHIPS, AND WHAT IT ASKS THE HOST FOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Built in: `concept`, `concept_reveal`, `video`, `single_choice`,
 * `multi_choice`, `match`, `order`, `chat_sandbox`, `terminal_sandbox`,
 * `document`, `diagram`,
 * `quiz`. The sandboxes joined in Fase C step 4 and are the first ones that are
 * not a single-submit question: N turns against a world model, and they still ask
 * the host for nothing but i18n, because all of their judging is
 * `@iterahq/activity-spec/runtime`'s. `document` / `diagram` / `quiz` joined in
 * Fase D — they had no files to move, only inline functions in the Player's
 * dispatcher, which is why they were last.
 * Everything else comes from `ActivityHostContext.renderers`, and a kind with
 * neither renders a visible, inert placeholder and emits `port.unavailable`
 * rather than throwing (ADR-3: degrade explicitly).
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import type { ActivityKind } from '@iterahq/activity-spec';
import { useActivityEmitter, useActivityHost } from './context.js';
import { cn } from './internal/cn.js';
import type { ActivityTheme } from './ports.js';
import type { ActivityRendererProps } from './renderer.js';
import { ConceptActivity } from './kinds/ConceptActivity.js';
import { ConceptRevealActivity } from './kinds/ConceptRevealActivity.js';
import { VideoActivity } from './kinds/VideoActivity.js';
import { SingleChoiceActivity } from './kinds/SingleChoiceActivity.js';
import { MultiChoiceActivity } from './kinds/MultiChoiceActivity.js';
import { MatchActivity } from './kinds/MatchActivity.js';
import { OrderActivity } from './kinds/OrderActivity.js';
import { ChatSandboxActivity } from './kinds/ChatSandboxActivity.js';
import { TerminalSandboxActivity } from './kinds/TerminalSandboxActivity.js';
import { DocumentActivity } from './kinds/DocumentActivity.js';
import { DiagramActivity } from './kinds/DiagramActivity.js';
import { QuizActivity } from './kinds/QuizActivity.js';
import { QuestionActivity } from './kinds/QuestionActivity.js';

/**
 * The kinds this package renders on its own.
 *
 * Exported so a host can ASK before it mounts — `BUILT_IN_ACTIVITY_KINDS`
 * plus its own `renderers` keys is exactly the set it can display, and finding
 * that out by rendering a placeholder is finding out too late.
 */
export const BUILT_IN_ACTIVITY_KINDS = [
  'concept',
  'concept_reveal',
  'video',
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'chat_sandbox',
  'terminal_sandbox',
  // Fase D. These three were never files: they were inline functions in the
  // Player's own ~700-line dispatcher, which is why Fase C left them behind
  // (`CONTRACT.md` finding 4: lifting them touches the file every other open PR
  // touches). They are 48% of the authored library — `document` 24 defs, `quiz`
  // 22, `diagram` 13 of 123 — so every host but the Player could render the
  // majority of the catalogue as an "unsupported kind" placeholder until now.
  //
  // `document` is the first BUILT-IN that can want the `api` port: its
  // AI-judged variant needs `api.judge`. It is still listed here without
  // qualification, and correctly so — absence of the port degrades it to the
  // reflection renderer, which is a real screen, not a placeholder. A kind
  // belongs on this list when the package can render it at all, not when the
  // host has every optional port.
  'document',
  'diagram',
  'quiz',
  // `question` (2026-08-28, ADR-6 of `20260828-itera-learning-engine-v1`) — the
  // first BUILT-IN that never grades anything. It asks for nothing from the
  // host but i18n, and it is also the first kind here with NO row in
  // `itera.activities`: the plans-app is what mounts it.
  'question',
] as const;

export type BuiltInActivityKind = (typeof BUILT_IN_ACTIVITY_KINDS)[number];

const BUILT_INS: Record<BuiltInActivityKind, ComponentType<ActivityRendererProps>> = {
  concept: ConceptActivity as ComponentType<ActivityRendererProps>,
  concept_reveal: ConceptRevealActivity as ComponentType<ActivityRendererProps>,
  video: VideoActivity as ComponentType<ActivityRendererProps>,
  single_choice: SingleChoiceActivity as ComponentType<ActivityRendererProps>,
  multi_choice: MultiChoiceActivity as ComponentType<ActivityRendererProps>,
  match: MatchActivity as ComponentType<ActivityRendererProps>,
  order: OrderActivity as ComponentType<ActivityRendererProps>,
  chat_sandbox: ChatSandboxActivity as ComponentType<ActivityRendererProps>,
  terminal_sandbox: TerminalSandboxActivity as ComponentType<ActivityRendererProps>,
  document: DocumentActivity as ComponentType<ActivityRendererProps>,
  diagram: DiagramActivity as ComponentType<ActivityRendererProps>,
  quiz: QuizActivity as ComponentType<ActivityRendererProps>,
  question: QuestionActivity as ComponentType<ActivityRendererProps>,
};

/** Whether this package can render a kind without help from the host. */
export function isBuiltInActivityKind(kind: string): kind is BuiltInActivityKind {
  return kind in BUILT_INS;
}

export function ActivityRenderer(props: ActivityRendererProps) {
  const { activity, onComplete, onEvent } = props;
  const { renderers, theme } = useActivityHost();
  const emit = useActivityEmitter(activity.id, activity.kind, onEvent);

  // `activity.viewed` fires once per activity id, not once per render. The ref
  // rather than an empty dep array because a host that swaps `activity` on the
  // SAME mounted element (the Player pages a lesson without remounting) would
  // otherwise emit for the first activity only.
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewedRef.current === activity.id) return;
    viewedRef.current = activity.id;
    emit('activity.viewed', { kind: activity.kind });
  }, [activity.id, activity.kind, emit]);

  const Kind =
    renderers?.[activity.kind as ActivityKind] ??
    (isBuiltInActivityKind(activity.kind) ? BUILT_INS[activity.kind] : undefined);

  if (!Kind) {
    return (
      <ActivityThemeScope theme={theme}>
        <UnsupportedKind kind={activity.kind} activityId={activity.id} onEvent={onEvent} />
      </ActivityThemeScope>
    );
  }

  return (
    <ActivityThemeScope theme={theme}>
      <Kind
        {...props}
        onComplete={(correct, detail) => {
          emit('activity.completed', { correct, ...(detail?.response ? { response: true } : {}) });
          onComplete(correct, detail);
        }}
      />
    </ActivityThemeScope>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE THEME PORT, APPLIED
 *
 * `ActivityTheme` was declared in `ports.ts` and documented in `CONTRACT.md`
 * from Fase A onwards, and until now NOTHING READ IT. `<ActivityProvider>`
 * memoised `host.theme` into the context value and the value died there: a
 * grep for `theme.tokens` / `theme.className` / `theme.appearance` reached no
 * DOM node. A host that passed `theme={{ tokens: { … } }}` got silence — not an
 * error, not a warning, not a changed pixel. This is where the declaration
 * becomes true.
 *
 * ── WHY HERE, AND NOT IN `<ActivityProvider>` ──────────────────────────────
 * The provider renders no DOM at all today, and it is mounted at the ROOT of a
 * host's tree — `IteraActivityHost` wraps the whole Itera Player, `.storybook/
 * preview.tsx` wraps every story. Putting a box there would wrap the host's
 * entire application in an element it did not ask for, and `className` would
 * then scope the app rather than the activity. `<ActivityRenderer>` is the one
 * place that is per-activity and is DOM, so "the activity root" is a thing that
 * exists here and nowhere else.
 *
 * ── WHY THERE IS NO ELEMENT WHEN THERE IS NO THEME ─────────────────────────
 * An unthemed render returns the kind untouched, with no wrapper. That is not a
 * micro-optimisation, it is the compatibility guarantee: every host that exists
 * today passes no `theme`, so every host that exists today gets byte-identical
 * DOM. An unconditional wrapper would insert a block-level box between the
 * host's layout container and the activity, and in a flex or grid parent that
 * changes the render for people who never asked for theming.
 *
 * The cost is honest and small: a themed host gains one element. It is stated
 * in `CONTRACT.md` rather than hidden.
 *
 * ── THE THREE MEMBERS, AND WHAT EACH ONE HONESTLY DOES ─────────────────────
 *  · `className` — put verbatim on the root, merged through `cn`. The scoping
 *    seam: `.acme-activities .rounded-3xl { … }` now has something to bind to.
 *  · `tokens`    — written as INLINE CSS custom properties, so they cascade to
 *    every descendant, beat a stylesheet declaration, and stay scoped to this
 *    activity instead of leaking to `:root`.
 *  · `appearance`— `data-appearance`, plus the `dark` class when it is `'dark'`,
 *    because the app and every known host run Tailwind with
 *    `darkMode: ["class"]`.
 *
 * ⚠️ `appearance: 'light'` CANNOT FORCE LIGHT, and saying so is the point.
 * Tailwind's class strategy is additive: a package can add `dark` to a subtree,
 * it cannot remove a `dark` that an ancestor put on `<html>`. So `'light'`
 * writes `data-appearance="light"` and adds no class — a host inside a dark
 * document stays dark, and it now has an attribute to write its own rule
 * against. Claiming more would be a lie a host only discovers on screen.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Normalise a token key to a CSS custom-property name.
 *
 * A key that already starts with `--` is passed through untouched. One that
 * does not gets the prefix, and that forgiveness is deliberate: React treats a
 * `style` key without `--` as a CSS PROPERTY name, so `{ radius: '2rem' }`
 * would be dropped without a word — the exact silent-no-op failure this whole
 * change exists to remove. Forgiving in one direction only; a correct key is
 * never rewritten.
 */
function tokenPropertyName(key: string): string {
  return key.startsWith('--') ? key : `--${key}`;
}

/** `true` when the host asked for anything at all. Decides whether a box exists. */
function themeIsActive(theme?: ActivityTheme): boolean {
  if (!theme) return false;
  return Boolean(
    theme.className || theme.appearance || (theme.tokens && Object.keys(theme.tokens).length > 0),
  );
}

/**
 * The activity root — present only when the host supplied a theme.
 *
 * `data-activity-theme` is here so a host's own e2e can address the box it
 * asked for, the same way `UnsupportedKind` carries `data-unsupported-kind`.
 */
function ActivityThemeScope({ theme, children }: { theme?: ActivityTheme; children: ReactNode }) {
  const style = useMemo<CSSProperties | undefined>(() => {
    const tokens = theme?.tokens;
    if (!tokens) return undefined;
    const entries = Object.entries(tokens);
    if (entries.length === 0) return undefined;
    return Object.fromEntries(
      entries.map(([key, value]) => [tokenPropertyName(key), value]),
    ) as CSSProperties;
  }, [theme?.tokens]);

  if (!themeIsActive(theme)) return <>{children}</>;

  return (
    <div
      className={cn(theme?.appearance === 'dark' && 'dark', theme?.className) || undefined}
      style={style}
      data-activity-theme="true"
      data-appearance={theme?.appearance}
    >
      {children}
    </div>
  );
}

/**
 * A kind nobody can render.
 *
 * Visible and inert, never a throw: an unknown kind in a lesson is a CONTENT
 * problem, and taking down the host's screen for it turns one unrenderable
 * activity into an unusable app. It carries `data-unsupported-kind` so a host's
 * own e2e can assert on it, and it emits `port.unavailable` so the gap shows up
 * in telemetry instead of only on someone's screen.
 */
function UnsupportedKind({
  kind,
  activityId,
  onEvent,
}: {
  kind: string;
  activityId: string;
  onEvent?: ActivityRendererProps['onEvent'];
}) {
  const emit = useActivityEmitter(activityId, kind, onEvent);
  useEffect(() => {
    emit('port.unavailable', { reason: 'no-renderer-for-kind' });
  }, [emit]);

  return (
    <div
      className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
      data-testid="activity-unsupported"
      data-activity-kind={kind}
      data-unsupported-kind="true"
    >
      {kind}
    </div>
  );
}
