import { useEffect, useRef, useState } from 'react';
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
 *
 * The same goes for a filled template that DRAWS nothing (a script that only logs,
 * or one whose listener waits for an event): the preview says so in its `ready`
 * message and the box gives way to one line. The frame stays mounted, so the next
 * fill is measured again.
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
  const frameHolder = useRef<HTMLDivElement>(null);
  const [drawsNothing, setDrawsNothing] = useState(false);

  useEffect(() => {
    if (!ready) {
      setDrawsNothing(false);
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'itera:ready') return;
      // Only our own preview frame: any window can post a message here.
      if (e.source !== frameHolder.current?.querySelector('iframe')?.contentWindow) return;
      setDrawsNothing(e.data.empty === true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [ready]);

  if (ready && drawsNothing) {
    return (
      <div className="rounded-2xl border border-border" data-testid="guided-preview-empty">
        <p className="px-6 py-4 text-center text-sm text-muted-foreground">{t('code.guided.previewEmpty')}</p>
        {/* Kept running, out of sight, so a changed fill reports again. */}
        <div ref={frameHolder} className="h-0 overflow-hidden" aria-hidden="true">
          <CodeLivePreview code={source} language={language} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        ready
          ? 'h-[min(360px,46dvh)] border-border md:h-auto md:min-h-[min(240px,46dvh)]'
          : 'border-dashed border-border/70 bg-background/40 max-sm:hidden'
      }`}
    >
      {ready ? (
        <div ref={frameHolder} className="h-full">
          <CodeLivePreview code={source} language={language} />
        </div>
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
