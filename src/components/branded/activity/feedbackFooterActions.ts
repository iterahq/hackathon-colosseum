export type FooterActionKind = 'retry' | 'continue';

export interface FooterActions {
  /** The action Enter triggers and the filled button runs; `null` while there is nothing to press. */
  primary: FooterActionKind | null;
  secondary: FooterActionKind | null;
}

/**
 * Which buttons the answer footer shows. A miss with a retry on offer leads with
 * "Tentar de novo" and keeps "Continuar" beside it; everything else is the lone
 * "Continuar" it always was. The live class passes neither handler and gets none.
 */
export function feedbackFooterActions({
  correct,
  canContinue,
  canRetry,
}: {
  correct: boolean;
  canContinue: boolean;
  canRetry: boolean;
}): FooterActions {
  if (!canContinue) return { primary: null, secondary: null };
  if (!correct && canRetry) return { primary: 'retry', secondary: 'continue' };
  return { primary: 'continue', secondary: null };
}
