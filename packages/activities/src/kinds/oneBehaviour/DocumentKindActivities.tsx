/**
 * The document family under the ONE-BEHAVIOUR RULE (plan
 * `20260924-activity-type-one-behavior-rule`, ADR-1, T12).
 *
 * `document` was three behaviours, and the RUBRIC plus the HOST picked one: a
 * read-only card, a reflection gated on a word count, or AI-judged writing —
 * and the AI-judged path silently became a reflection when the host had no
 * `api.judge` port. The kind now says which judge decides:
 *
 * | kind                | input | judge                                 |
 * |---------------------|-------|---------------------------------------|
 * | `document_read`     | read  | none — the shell advances             |
 * | `document_reflect`  | write | word count (`min_words`, 0 allowed)   |
 * | `document_ai_judge` | write | the AI judge; NO port → an explicit "unavailable" card |
 *
 * ⚠️ NO HOST-DEPENDENT BEHAVIOUR. `document_ai_judge` without `api.judge`
 * renders `document-ai-judge-unavailable` and emits `port.unavailable`. It
 * never falls through to the reflection: a learner who writes there would
 * finish an activity the author meant an AI to grade (the rule's second
 * loophole, "degrade explicitly", ADR-3 of the activities lib).
 *
 * The threshold: production grading still lives in the `rubric` COLUMN (no
 * production spec carries `evaluation`). `spec.evaluation.minWords` wins when
 * an author writes it; `rubric.min_words` is the transition source.
 */
import { useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useActivityEmitter, useActivityHost, useActivityI18n } from '../../context.js';
import type { ActivityCompletion, ActivityRendererProps, PortableActivity } from '../../renderer.js';
import type { DocumentRubric, DocumentSpec } from '../../specs.js';
import { RichText } from '../../components/RichText.js';
import { ActivityShell } from '../../components/parts.js';
import { AiJudgeDocumentActivity } from '../document/AiJudgeDocumentActivity.js';
import { ReflectionDocumentActivity } from '../document/ReflectionDocumentActivity.js';
import { KindSpecGate } from './KindSpecGate.js';

type DocumentKindProps = {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  onEvent?: ActivityRendererProps['onEvent'];
};

/** The read-only card: a prompt and a body, nothing to do. */
export function DocumentReadCard({ activity }: { activity: PortableActivity }) {
  const { t } = useActivityI18n();
  const spec = (activity.spec ?? {}) as unknown as DocumentSpec;
  return (
    <ActivityShell kind={activity.kind} icon={FileText} label={t('activity.document')}>
      <RichText
        text={spec.prompt ?? spec.title ?? t('activity.document')}
        data-testid="document-prompt"
      />
      {spec.body && <RichText text={spec.body} muted className="mt-4" data-testid="document-body" />}
    </ActivityShell>
  );
}

/** `document_read` — read a prompt and a body; the shell advances. */
export function DocumentReadActivity({ activity }: DocumentKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <DocumentReadCard activity={activity} />
    </KindSpecGate>
  );
}

/** The word-count floor of a `document_reflect` row. */
function reflectMinWords(activity: PortableActivity): number {
  const evaluation = (activity.spec as { evaluation?: { mode?: string; minWords?: number } } | null)
    ?.evaluation;
  if (evaluation?.mode === 'word-count' && typeof evaluation.minWords === 'number') {
    return evaluation.minWords;
  }
  const rubric = (activity.rubric ?? {}) as DocumentRubric;
  return typeof rubric.min_words === 'number' ? rubric.min_words : 0;
}

/** `document_reflect` — write; a word count gates the submit. */
export function DocumentReflectActivity({ activity, onComplete }: DocumentKindProps) {
  const spec = (activity.spec ?? {}) as unknown as DocumentSpec;
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <ReflectionDocumentActivity
        activity={activity}
        spec={spec}
        minWords={reflectMinWords(activity)}
        onComplete={onComplete}
      />
    </KindSpecGate>
  );
}

/** The explicit "no judge here" state of `document_ai_judge`. */
function JudgeUnavailable({ activity, onEvent }: DocumentKindProps) {
  const { t } = useActivityI18n();
  const emit = useActivityEmitter(activity.id, activity.kind, onEvent);
  useEffect(() => {
    emit('port.unavailable', { reason: 'no-judge-port', port: 'api.judge' });
  }, [emit]);
  const spec = (activity.spec ?? {}) as unknown as DocumentSpec;
  return (
    <ActivityShell kind={activity.kind} icon={FileText} label={t('activity.document')}>
      <RichText
        text={spec.prompt ?? spec.title ?? t('activity.document')}
        data-testid="document-prompt"
      />
      <p
        className="mt-5 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
        data-testid="document-ai-judge-unavailable"
        data-port-unavailable="api.judge"
      >
        {t('activity.judgeUnavailable')}
      </p>
    </ActivityShell>
  );
}

/** `document_ai_judge` — write; the AI judge decides. No port → explicit card. */
export function DocumentAiJudgeActivity(props: DocumentKindProps) {
  const { api } = useActivityHost();
  const { activity, onComplete } = props;
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      {api?.judge ? (
        <AiJudgeDocumentActivity activity={activity} onComplete={onComplete} />
      ) : (
        <JudgeUnavailable {...props} />
      )}
    </KindSpecGate>
  );
}
