/**
 * MediaHoverToggle — the switch for the hover preview. On the thumbnail it is
 * always visible while the preview is off, so it can be found and turned on,
 * and hides until the card is hovered or focused once it is on. On the open
 * preview it is the same control, always visible, the only part of the overlay
 * that takes the pointer. One label for both states; `aria-pressed` says which.
 *
 * A sibling of the card, never inside it: the card is a `<button>` and a
 * button inside a button is invalid markup and a double click.
 */
import { forwardRef } from 'react';
import { ZoomIn } from 'lucide-react';
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
  const label = t('activity.mediaHoverToggle');

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
      className={`flex items-center justify-center rounded-full border transition-opacity duration-200 ${
        enabled ? 'border-menta bg-menta text-obsidiana' : 'border-border bg-obsidiana/90 text-foreground/80 hover:text-foreground'
      } focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-menta/60 ${className}`}
    >
      <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
});
