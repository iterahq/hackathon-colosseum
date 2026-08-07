/**
 * MOVED — the answer state machine now lives in `@iterahq/activities`.
 *
 * Fase C, step 1 ("lógica pura") of plan
 * `20260803-itera-player-activities-lib`. It is pure and it is what the
 * extracted kinds grade with, so it travelled with them. This file stays as the
 * app's import path (`@/utils/answerMachine`) so the ~8 call sites and
 * `answerMachine.test.ts` did not have to move in the same PR.
 */
export { answerMachine, choiceOptionState } from '@iterahq/activities';
export type {
  AnswerMachineInput,
  AnswerMachineState,
  ChoiceOptionState,
} from '@iterahq/activities';
