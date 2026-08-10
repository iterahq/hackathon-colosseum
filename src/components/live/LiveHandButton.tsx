import { Hand } from 'lucide-react';
import { useI18n } from '@/i18n';

interface LiveHandButtonProps {
  raised: boolean;
  onToggle: () => void;
  /** Sidebar placement: full-width row with the label always visible. */
  full?: boolean;
}

/**
 * Learner-only toggle to raise/lower their hand. It lives at the top of the
 * learner sidebar (`full`), opposite the activity column — squeezed into the top
 * chrome it was too small to be found mid-class.
 */
export function LiveHandButton({ raised, onToggle, full = false }: LiveHandButtonProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="live-hand-btn"
      data-raised={raised ? 'true' : 'false'}
      aria-pressed={raised}
      aria-label={raised ? t('live.hand.lower') : t('live.hand.raise')}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors ${
        full ? 'w-full h-10 justify-center text-sm' : 'h-10 px-3 sm:h-8 text-xs'
      } ${
        raised
          ? 'bg-clay text-white border-clay animate-pulse'
          : 'bg-card text-foreground border-border hover:border-clay/50'
      }`}
    >
      <Hand className="w-3.5 h-3.5" />
      <span className={full ? '' : 'hidden sm:inline'}>
        {raised ? t('live.hand.lower') : t('live.hand.raise')}
      </span>
    </button>
  );
}
