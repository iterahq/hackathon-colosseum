/**
 * Which activity kinds surface their answer feedback in the GLOBAL fixed
 * `FeedbackFooter` (the Duolingo pattern) — plus the shared result shape.
 *
 * Kept in its own (component-free) module so `FeedbackFooter.tsx` stays a
 * pure-component file (react-refresh / fast-refresh friendly) and both the async
 * player and the live player import these without pulling in the component.
 */
import type { ProducedArtifact } from '@/services/artifact.service';
import type { RecordedAction } from '@/utils/activityFamilies';

/**
 * The graded activity kinds whose answer feedback surfaces in the fixed footer.
 *
 * The sandbox kinds are INCLUDED (Tainan 2026-07-18): their terminal verdict +
 * "Continuar" now live in the same shell footer as the MCQ family, so
 * feedback-in-footer is consistent for ALL activity types (the Duolingo / chess
 * reference). The sandbox's in-window terminal "Continuar" CTA was removed to
 * avoid a double-CTA — the activity emits its settled verdict UP via
 * `onComplete(correct, detail)` and the shell drives the footer. (Superseded the
 * earlier deliberate exclusion that kept the sandbox's own bottom CTA.)
 */
export const FOOTER_GRADED_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'order',
  'match',
  'quiz',
  // Os dois kinds de sandbox. Faltar um aqui não deixa o footer feio — deixa a
  // atividade SEM veredito e SEM "Continuar", porque o CTA in-window foi
  // removido justamente por confiar neste conjunto.
  'chat_sandbox',
  'terminal_sandbox',
  // The eight one-behaviour sandbox kinds (plan `20260924-activity-type-one-behavior-rule`):
  // the same shells, so the same footer — missing one here would leave it with
  // no verdict and no "Continuar".
  'chat_compose',
  'chat_fill_select',
  'chat_fill_type',
  'chat_pick_context',
  'chat_rate_reply',
  'terminal_type_command',
  'terminal_pick_command',
  'terminal_build_command',
]);

/** Whether an activity kind's feedback should surface in the fixed footer. */
export function isFooterGradedKind(kind: string | null | undefined): boolean {
  return !!kind && FOOTER_GRADED_KINDS.has(kind);
}

export interface FooterResult {
  correct: boolean;
  /** Overrides the default correct/incorrect headline. */
  message?: string;
  /** Optional secondary explanation line. */
  explanation?: string;
}

/**
 * The optional richer verdict an activity may hand UP alongside the `correct`
 * boolean, so the shell footer can carry the activity's own settled explanation
 * (the sandbox reveal recap / the BYOC judge feedback) without the shell having
 * to recompute it. Additive + optional — every existing `onComplete(correct)`
 * caller stays valid.
 */
export interface ActivityCompleteDetail {
  /** Overrides the default correct/incorrect headline. */
  message?: string;
  /** A secondary explanation line (reveal recap / judge WHY). */
  explanation?: string;
  /**
   * Content the learner PRODUCED, handed up so a learner-facing player can
   * persist it (plan 20260728-itera-artifact-storage, Phase 1).
   *
   * Why up here instead of the activity saving it directly: the author TEST
   * harness mounts the very same `ActivityRenderer`, and canvas ADR-12 requires
   * that a test run write NOTHING. Routing the content up means only the
   * learner-facing player ever calls `saveArtifact` — the same boundary that
   * already keeps the harness from touching itera.progress. An activity that
   * saved itself would silently break that guarantee.
   */
  artifact?: ProducedArtifact;
  /**
   * A plain-text summary of what the learner ANSWERED, for activities that do
   * not author a file — the deterministic kinds (single/multi choice, ordering,
   * matching).
   *
   * This is the raw material for Tainan's case: *"às vezes uma resposta
   * determinística ainda pode gerar algo útil que deve ser persistido — seria
   * como um template que… gera algo útil mesmo sem usar IA."* The player feeds
   * it through the activity's authored `template` to produce a real deliverable.
   *
   * ⚠️ Handing this up does NOT cause a write. It is dropped unless the author
   * set `artifact_policy.mode = 'always'` on that activity, which is why adding
   * it to these components changes nothing for existing lessons.
   */
  response?: string;
  /**
   * The ORDERED SEQUENCE of what the learner did to reach this answer — the HOW,
   * where `response` is the WHAT (plan
   * `20260731-itera-padroes-reducer-atividades`).
   *
   * Emitted by activities of a WIRED family (`FAMILY_EMITTED` in
   * `src/utils/activityFamilies.ts`); every other kind omits it and gets the
   * honest two-action trace. Timestamps are WALL CLOCK and are rebased against
   * the trace origin by `buildAttemptTrace` — the activity does not know the
   * origin and must not be given the player's clock to find out.
   *
   * ⚠️ Handing this up does NOT cause a write, exactly like `artifact` and
   * `response` above: only the learner-facing players call the persistence
   * path, which is the boundary that keeps `ActivityTestHarness` from turning
   * curator traffic into learner data.
   */
  actions?: readonly RecordedAction[];
}
