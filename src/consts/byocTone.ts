/**
 * Visual state of a BYOC generated option, before and after grading.
 *
 * `picked` is blue and `chosen` is green on purpose: `chosen` sits in a graded
 * tree where green will shortly mean "correct", while `picked` belongs to
 * `build_context`, which has no answer key — green there would read as a grade
 * the activity never gives.
 */
export type OptionTone = 'neutral' | 'chosen' | 'picked' | 'correct' | 'wrong';

export const BYOC_TONE_CLASS: Record<OptionTone, string> = {
  neutral: 'border-border bg-card',
  chosen: 'border-menta bg-menta/10',
  picked: 'border-azul bg-azul/10',
  correct: 'border-verde-tech bg-verde-tech/10',
  wrong: 'border-destructive bg-destructive/10',
};

export const BYOC_PICKABLE_HOVER = 'hover:border-azul-hi hover:bg-azul/5';
