/**
 * A "write what you learned" document activity with a REAL text input.
 * Completion is gated on the rubric's `min_words` (or any non-empty text when
 * `min_words` is 0).
 *
 * It exists because the read-only card was once used for prompts too, and the
 * result was a hollow stub: a question on screen, a "Mark done" button, and
 * nowhere to answer. The word counter is not decoration — it is the only thing
 * that tells the learner how far they are from the threshold that unlocks the
 * button.
 *
 * ⚠️ THE WRITTEN TEXT IS HANDED UP TWICE, ON PURPOSE, AND THE TWO ARE NOT
 * REDUNDANT. `artifact` only survives when the author opted this activity into
 * persisting (`artifact_policy`); `response` is the attempt-log copy, which the
 * instructor can read either way. Dropping either one loses a real reader.
 *
 * ⚠️ Handing content up is NOT a write. Only a learner-facing host persists —
 * which is the boundary that keeps an author's test harness, and the
 * back-office preview, from turning curator traffic into learner data.
 */
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useActivityI18n } from '../../context.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import type { DocumentSpec } from '../../specs.js';
import { ActivityTextarea } from '../../components/ActivityTextarea.js';
import { ArtifactVisibilityNotice } from '../../components/ArtifactVisibilityNotice.js';
import { RichText } from '../../components/RichText.js';
import { ActivityShell, DoneButton } from '../../components/parts.js';

/** Count words in a free-text reflection (whitespace-split, trimmed). */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function ReflectionDocumentActivity({
  activity,
  spec,
  minWords,
  onComplete,
}: {
  activity: PortableActivity;
  spec: DocumentSpec;
  minWords: number;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
}) {
  const { t } = useActivityI18n();
  const [text, setText] = useState('');
  const isDone = activity.status === 'done';
  const words = countWords(text);
  const meetsMin = words >= Math.max(minWords, 1);

  return (
    <ActivityShell kind={activity.kind} icon={FileText} label={t('activity.document')}>
      <RichText
        text={spec?.prompt ?? spec?.title ?? t('activity.document')}
        data-testid="document-prompt"
      />
      {spec?.body && (
        <RichText text={spec.body} muted className="mt-4" data-testid="document-body" />
      )}

      <ActivityTextarea
        value={text}
        onChange={setText}
        placeholder={t('activity.reflectionPlaceholder')}
        rows={6}
        data-testid="document-reflection-input"
        className="mt-5"
      />

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span data-testid="document-word-count">
          {words} {t('activity.words')}
        </span>
        {minWords > 0 && (
          <span data-testid="document-min-words" className={meetsMin ? 'text-evergreen-hi' : ''}>
            {t('activity.minWords')}: {minWords}
          </span>
        )}
      </div>

      <ArtifactVisibilityNotice />

      <DoneButton
        done={isDone}
        disabled={!meetsMin}
        onClick={() =>
          onComplete(true, {
            artifact: {
              type: 'text',
              content: text,
              filename: 'reflection.md',
              mimeType: 'text/markdown',
            },
            response: text,
          })
        }
      />
    </ActivityShell>
  );
}
