/**
 * MediaHoverToggle — the quiet switch for the hover preview. On the thumbnail
 * it hides until the card is hovered or focused while the preview is on, and
 * stays dimly visible while off so it can always be turned back on. On the
 * open preview it is the same control, always visible, the only part of the
 * overlay that takes the pointer.
 *
 * A sibling of the card, never inside it: the card is a `<button>` and a
 * button inside a button is invalid markup and a double click.
 */
import { forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useActivityI18n } from '../context.js';

export const MediaHoverToggle = forwardRef<
  HTMLButtonElement,
  {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    className?: string;
    testId?: string;
  }
>(function MediaHoverToggle({ enabled, onChange, className = '', testId = 'media-hover-toggle' }, ref) {
  const { t } = useActivityI18n();
  const label = t(enabled ? 'activity.mediaHoverOff' : 'activity.mediaHoverOn');
  const Icon = enabled ? Eye : EyeOff;

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!enabled);
      }}
      data-testid={testId}
      className={`flex items-center justify-center rounded-full border border-border bg-obsidiana/90 text-foreground/80 transition-opacity duration-200 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-menta/60 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
});
