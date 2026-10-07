/**
 * The kinds that redraw a prior answer from its action sequence (`priorAnswer`
 * in `@iterahq/activities`). A host only hands an answer back down to these.
 */
export const RESTORES_FROM_ACTIONS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'question',
  'question_pick_one',
  'question_pick_many',
  'decompose_canvas',
]);
