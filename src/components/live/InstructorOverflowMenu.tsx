import { Coffee, MoreHorizontal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useI18n } from '@/i18n';

interface InstructorOverflowMenuProps {
  busy: boolean;
  /** The class is paused for questions. */
  onBreak: boolean;
  onToggleBreak: () => void;
}

/**
 * Rarely-used professor actions, folded behind a kebab so the sidebar keeps its
 * vertical budget for the flow controls. The trigger stays tinted while a state
 * it owns is active — a menu that hides an ON switch is a menu the professor
 * forgets to turn off.
 */
export function InstructorOverflowMenu({ busy, onBreak, onToggleBreak }: InstructorOverflowMenuProps) {
  const { t } = useI18n();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          data-testid="instructor-more"
          data-active={onBreak ? 'true' : 'false'}
          aria-label={t('live.instructor.control.more')}
          title={t('live.instructor.control.more')}
          className={`inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
            onBreak
              ? 'border-streak bg-streak/15 text-streak'
              : 'border-border bg-background text-foreground hover:border-evergreen/40'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56" data-testid="instructor-more-popover">
        <button
          type="button"
          onClick={onToggleBreak}
          disabled={busy}
          aria-pressed={onBreak}
          data-testid="instructor-break"
          className={`w-full inline-flex items-center gap-2 h-9 px-2.5 rounded-lg text-sm text-left transition-colors disabled:opacity-40 ${
            onBreak ? 'bg-streak/15 text-streak' : 'text-foreground hover:bg-muted'
          }`}
        >
          <Coffee className="w-3.5 h-3.5 shrink-0" />
          {onBreak ? t('live.instructor.control.breakOff') : t('live.instructor.control.break')}
        </button>
      </PopoverContent>
    </Popover>
  );
}
