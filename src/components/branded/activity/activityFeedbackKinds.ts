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
 * The `sandbox_scenario` kinds are intentionally EXCLUDED — the sandbox owns its
 * own in-window terminal "Continuar" affordance (already a full-width bottom
 * CTA) and its own inline rating verdict, so layering the shell footer on top
 * would double the CTA.
 */
export const FOOTER_GRADED_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'order',
  'match',
  'quiz',
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
