import { useActivityI18n } from '../../context.js';
import { CodeLivePreview } from '../CodeLivePreview.js';

/**
 * The preview, held back until every hole is filled.
 *
 * A half-substituted template is a syntax error, so rendering it early would put
 * a red stack trace in front of code the learner has not finished reading — which
 * reads as "I broke it" and is the one message a first exercise must not send.
 *
 * While it waits it is one line high: an empty 360 px box under the code was the
 * whole scroll of a fill-in exercise on a phone.
 */
export function GuidedCodePreview({
  source,
  language,
  ready,
}: {
  source: string;
  /** `spec.language` — threaded through so a `blanks` html exercise renders the
   * filled template as a document instead of transpiling it as React. */
  language?: string;
  ready: boolean;
}) {
  const { t } = useActivityI18n();

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border ${
        ready ? 'h-[min(360px,46dvh)] md:h-auto md:min-h-[min(240px,46dvh)]' : 'max-sm:hidden'
      }`}
    >
      {ready ? (
        <CodeLivePreview code={source} language={language} />
      ) : (
        <div
          data-testid="guided-preview-waiting"
          className="flex h-full items-center justify-center px-6 py-4 text-center text-sm text-muted-foreground"
        >
          {t('code.guided.previewWaiting')}
        </div>
      )}
    </div>
  );
}
