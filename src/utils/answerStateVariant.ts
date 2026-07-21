export type AnswerStateVariant = 'pending' | 'answered' | 'done' | 'wrong';

/**
 * Collapses a live answer state into the icon variant a sidebar row shows.
 * Learners (showDetail=false) only ever see answered vs pending — correctness
 * stays off the student surface.
 */
export function answerStateVariant(state: string | undefined, showDetail: boolean): AnswerStateVariant {
  if (!state || state === 'pending') return 'pending';
  if (!showDetail) return 'answered';
  return state === 'done' ? 'done' : 'wrong';
}
