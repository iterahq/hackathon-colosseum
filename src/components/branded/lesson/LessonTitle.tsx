import { useI18n } from '@/i18n';
import { useClippedText } from './useClippedText';
import { useTransientOpen } from './useTransientOpen';

export const TITLE_POPOVER_MS = 3000;

/**
 * The lesson title: one truncated line. Hover has the `title`; a finger has
 * nothing, so when (and only when) the line is cut, a button laid over it shows
 * the full text for a few seconds. The heading itself is untouched, so its
 * accessible name and size stay what they were.
 */
export function LessonTitle({ text, className }: { text: string; className: string }) {
  const { t } = useI18n();
  const { ref, clipped } = useClippedText<HTMLHeadingElement>(text);
  const { containerRef, open, toggle, close } = useTransientOpen<HTMLDivElement>(TITLE_POPOVER_MS);
  const expanded = clipped && open;

  return (
    <div ref={containerRef} className="relative">
      <h1 ref={ref} title={clipped ? text : undefined} className={className} data-testid="lesson-title">
        {text}
      </h1>
      {clipped && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={t('lesson.showFullTitle')}
          onClick={toggle}
          onBlur={close}
          data-testid="lesson-title-more"
          className="absolute -inset-y-1.5 inset-x-0"
        />
      )}
      {expanded && (
        <div
          aria-hidden="true"
          data-testid="lesson-title-full"
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-border bg-card px-3 py-2 font-display text-base font-semibold text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
        >
          {text}
        </div>
      )}
    </div>
  );
}
