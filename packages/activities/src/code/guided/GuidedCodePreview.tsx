import { useActivityI18n } from '../../context.js';
import { CodeLivePreview } from '../CodeLivePreview.js';

/**
 * The preview, held back until every hole is filled.
 *
 * A half-substituted template is a syntax error, so rendering it early would put
 * a red stack trace in front of code the learner has not finished reading — which
 * reads as "I broke it" and is the one message a first exercise must not send.
 */
export function GuidedCodePreview({ source, ready }: { source: string; ready: boolean }) {
  const { t } = useActivityI18n();

  return (
    <div className="h-[360px] overflow-hidden rounded-2xl border border-border">
      {ready ? (
        <CodeLivePreview code={source} />
      ) : (
        <div
          data-testid="guided-preview-waiting"
          className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
        >
          {t('code.guided.previewWaiting')}
        </div>
      )}
    </div>
  );
}
