/**
 * MOVED-STYLE RE-EXPORTS — the one-behaviour kinds (plan
 * `20260924-activity-type-one-behavior-rule`, T9–T14) live in
 * `@iterahq/activities`, like every other kind.
 *
 * One file for the 19 package-rendered kinds instead of 19 one-line files: the
 * app resolves every kind from `./<Kind>Activity`, and this is that path for
 * the new ones. The five `code_*` kinds come from the `/code` entrypoint for
 * the reason `CodeSnackActivity.tsx` states (the preview runtime stays out of a
 * host that renders no code). The three `byoc_*` kinds are the app's own
 * (`./byoc/ByocKindActivity`), like the `spec.byoc` layer they replace.
 */
export {
  ChatComposeActivity,
  ChatFillSelectActivity,
  ChatFillTypeActivity,
  ChatPickContextActivity,
  ChatRateReplyActivity,
  DocumentAiJudgeActivity,
  DocumentReadActivity,
  DocumentReflectActivity,
  QuestionPickManyActivity,
  QuestionPickOneActivity,
  QuestionWriteActivity,
  TerminalBuildCommandActivity,
  TerminalPickCommandActivity,
  TerminalTypeCommandActivity,
} from '@iterahq/activities';
export {
  CodeEditorChecksActivity,
  CodeEditorUngradedActivity,
  CodeFillBankActivity,
  CodeFillSelectActivity,
  CodeFillTypeActivity,
} from '@iterahq/activities/code';
