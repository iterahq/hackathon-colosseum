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
import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import type { ActivityKind } from '@iterahq/activity-spec';
import { useActivityEmitter, useActivityHost } from './context.js';
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
};

/** Whether this package can render a kind without help from the host. */
export function isBuiltInActivityKind(kind: string): kind is BuiltInActivityKind {
  return kind in BUILT_INS;
}

export function ActivityRenderer(props: ActivityRendererProps) {
  const { activity, onComplete, onEvent } = props;
  const { renderers } = useActivityHost();
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
    return <UnsupportedKind kind={activity.kind} activityId={activity.id} onEvent={onEvent} />;
  }

  return (
    <Kind
      {...props}
      onComplete={(correct, detail) => {
        emit('activity.completed', { correct, ...(detail?.response ? { response: true } : {}) });
        onComplete(correct, detail);
      }}
    />
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
