/**
 * MediaHoverCoach — the small balloon, arrow up at the switch, that introduces
 * the hover preview. It takes no focus, sits beside the switch rather than over
 * the picture's middle, and has no motion of its own.
 */
import { useActivityI18n } from '../context.js';

export function MediaHoverCoach({ onDismiss, className = '' }: { onDismiss: () => void; className?: string }) {
  const { t } = useActivityI18n();
  return (
    <div
      role="note"
      data-testid="media-hover-coach"
      className={`absolute right-2 top-11 z-20 w-52 rounded-xl border border-menta/50 bg-obsidiana p-3 text-sm text-foreground shadow-lg ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute -top-1.5 right-[14px] h-3 w-3 rotate-45 border-l border-t border-menta/50 bg-obsidiana"
      />
      <p className="leading-snug">{t('activity.mediaHoverCoach')}</p>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="media-hover-coach-ok"
        className="mt-2 rounded-full bg-menta px-3 py-1 text-xs font-semibold text-obsidiana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-menta/60"
      >
        {t('activity.mediaHoverCoachOk')}
      </button>
    </div>
  );
}
