/** Visual state of a BYOC generated option, before and after grading. */
export type OptionTone = 'neutral' | 'chosen' | 'correct' | 'wrong';

export const BYOC_TONE_CLASS: Record<OptionTone, string> = {
  neutral: 'border-border bg-card',
  chosen: 'border-menta bg-menta/10',
  correct: 'border-verde-tech bg-verde-tech/10',
  wrong: 'border-destructive bg-destructive/10',
};
