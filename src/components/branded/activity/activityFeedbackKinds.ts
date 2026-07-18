/**
 * Which activity kinds surface their answer feedback in the GLOBAL fixed
 * `FeedbackFooter` (the Duolingo pattern) — plus the shared result shape.
 *
 * Kept in its own (component-free) module so `FeedbackFooter.tsx` stays a
 * pure-component file (react-refresh / fast-refresh friendly) and both the async
 * player and the live player import these without pulling in the component.
 */

/**
 * The graded activity kinds whose answer feedback surfaces in the fixed footer.
 *
 * `sandbox_scenario` is INCLUDED (Tainan 2026-07-18): its terminal verdict +
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
  'sandbox_scenario',
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
}
