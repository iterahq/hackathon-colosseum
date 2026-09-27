/**
 * The code family under the ONE-BEHAVIOUR RULE (plan
 * `20260924-activity-type-one-behavior-rule`, ADR-1 + ADR-2, T9).
 *
 * `code` chose the open editor or the guided template from the SHAPE of the
 * spec (`blanks` present → guided), and inside the guided one each blank chose
 * its own input (`bank` / `select` / `text`) — "drag and drop VS type" inside
 * ONE kind. Each kind below names its surface; the panes stay shared:
 *
 * | kind                   | surface                         | judge       |
 * |------------------------|---------------------------------|-------------|
 * | `code_editor_checks`   | open editor + live preview      | DOM checks  |
 * | `code_editor_ungraded` | open editor + live preview      | none ("Done") |
 * | `code_fill_bank`       | locked template, chips          | answer text |
 * | `code_fill_select`     | locked template, dropdowns      | answer text |
 * | `code_fill_type`       | locked template, typed blanks   | answer text |
 *
 * The spec gate guarantees the narrowing (every blank of `code_fill_bank` is a
 * `bank` blank, `code_editor_checks` has checks, …), so the shared pane draws
 * exactly one input. Like `CodeActivity`, these live behind the `/code`
 * entrypoint (ADR-5): a host that renders no code pays for no preview runtime.
 */
import type { CodeSpec } from '@iterahq/activity-spec';
import type { ActivityRendererProps } from '../renderer.js';
import { safeParseKindSpec } from '../oneBehaviourKinds.js';
import { KindInvalidCard } from '../kinds/oneBehaviour/KindSpecGate.js';
import { CodeSnackPane } from './CodeSnackPane.js';
import { GuidedCodePane } from './guided/GuidedCodePane.js';

function parseCodeKind(activity: ActivityRendererProps['activity']): CodeSpec | null {
  const parsed = safeParseKindSpec(activity.kind, activity.spec);
  return parsed.success ? (parsed.data as CodeSpec) : null;
}

/** The open editor: `code_editor_checks` and `code_editor_ungraded`. */
function CodeEditorKind({ activity, onComplete }: ActivityRendererProps) {
  const spec = parseCodeKind(activity);
  if (!spec) return <KindInvalidCard kind={activity.kind} />;
  // No `reveal`: an open editor carries no authored solution to show.
  return <CodeSnackPane activity={activity} spec={spec} onComplete={onComplete} />;
}

/** The locked template: `code_fill_bank`, `code_fill_select`, `code_fill_type`. */
function CodeFillKind({ activity, onComplete, reveal }: ActivityRendererProps) {
  const spec = parseCodeKind(activity);
  if (!spec) return <KindInvalidCard kind={activity.kind} />;
  return <GuidedCodePane activity={activity} spec={spec} onComplete={onComplete} reveal={reveal} />;
}

/** `code_editor_checks` — type in the open editor; DOM checks grade the preview. */
export const CodeEditorChecksActivity = CodeEditorKind;
/** `code_editor_ungraded` — type in the open editor; the learner clicks Done. */
export const CodeEditorUngradedActivity = CodeEditorKind;
/** `code_fill_bank` — drag or click a chip into every blank. */
export const CodeFillBankActivity = CodeFillKind;
/** `code_fill_select` — pick every blank from a dropdown. */
export const CodeFillSelectActivity = CodeFillKind;
/** `code_fill_type` — type every blank. */
export const CodeFillTypeActivity = CodeFillKind;
