/**
 * `document` — ONE kind, THREE renderers, and the choice between them is made
 * by the RUBRIC and the HOST'S CAPABILITIES, never by a second enum.
 *
 *   rubric.mode === 'ai-judge'  AND  the host supplies `api.judge`
 *        → AiJudgeDocumentActivity  (generate a brief · write · AI verdict)
 *   spec.prompt  OR  rubric.min_words > 0
 *        → ReflectionDocumentActivity  (a real textarea, gated on word count)
 *   otherwise
 *        → the read-only card below (prompt + body, nothing to do)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE `&&` IN THE FIRST BRANCH IS THE WHOLE OF ADR-3, AND IT IS NOT A FALLBACK
 * ─────────────────────────────────────────────────────────────────────────────
 * The Player wrote it as `rubric.mode === 'ai-judge' && iteraApiConfigured()`,
 * where the right-hand side read `import.meta.env.VITE_ITERA_API_BASE`. That
 * expression is answered at BUILD time, so compiled into a package it would
 * report on the machine that built the library rather than the app that runs
 * it — and it would report `false` for every consumer, forever.
 *
 * `Boolean(api?.judge)` asks the HOST, at runtime. The Itera Player supplies
 * the port only when its API base is configured, so the behaviour it produces
 * is bit-identical to the env read it replaced; any other host answers for
 * itself. This is the "absence of a method IS the capability probe" rule that
 * `ports.ts` states, at the one call site where it decides which screen a
 * learner sees.
 *
 * And the degradation is real rather than an error card: a judge-less host
 * falls through to the REFLECTION renderer, so the learner still reads the
 * prompt and still writes an answer — they just do not get an AI verdict on it.
 * That was already the Player's behaviour with the API unconfigured, and it is
 * why the branch order matters: `ai-judge` is an enhancement over reflection,
 * not a different activity.
 */
import { FileText } from 'lucide-react';
import { useActivityHost, useActivityI18n } from '../context.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';
import type { DocumentRubric, DocumentSpec } from '../specs.js';
import { RichText } from '../components/RichText.js';
import { ActivityShell } from '../components/parts.js';
import { AiJudgeDocumentActivity } from './document/AiJudgeDocumentActivity.js';
import { ReflectionDocumentActivity } from './document/ReflectionDocumentActivity.js';

export function DocumentActivity({
  activity,
  onComplete,
  priorAnswer,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  priorAnswer?: ActivityCompletion;
}) {
  const { t } = useActivityI18n();
  const { api } = useActivityHost();
  const spec = (activity.spec ?? {}) as unknown as DocumentSpec;
  const rubric = (activity.rubric ?? {}) as DocumentRubric;

  if (rubric.mode === 'ai-judge' && Boolean(api?.judge)) {
    return <AiJudgeDocumentActivity activity={activity} onComplete={onComplete} />;
  }

  const minWords = typeof rubric.min_words === 'number' ? rubric.min_words : 0;
  if (Boolean(spec.prompt) || minWords > 0) {
    return (
      <ReflectionDocumentActivity
        activity={activity}
        spec={spec}
        minWords={minWords}
        onComplete={onComplete}
        priorAnswer={priorAnswer}
      />
    );
  }

  // Read-only: a body with no prompt is something to READ, so it carries no
  // affordance at all — not even "Mark done". Advancing is the shell's job,
  // exactly as it is for `concept`.
  return (
    <ActivityShell kind="document" icon={FileText} label={t('activity.document')}>
      <RichText
        text={spec.prompt ?? spec.title ?? t('activity.document')}
        data-testid="document-prompt"
      />
      {spec.body && (
        <RichText text={spec.body} muted className="mt-4" data-testid="document-body" />
      )}
    </ActivityShell>
  );
}
