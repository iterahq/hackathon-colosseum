/**
 * MOVED — the shared presentation primitives now live in `@iterahq/activities`
 * (Fase C, step 2).
 *
 * `ActivityShell`, `KindBadge`, `DoneButton` and `SubmitButton` are composed by
 * the extracted kinds AND by the ones still in the app (sandbox · terminal ·
 * byoc · code), so they had to cross with the first group and stay reachable by
 * the second. This file is that reach.
 */
export {
  ActivityShell,
  AnswerExplanation,
  DoneButton,
  ExplanationDisclosure,
  KindBadge,
  SubmitButton,
} from '@iterahq/activities';
