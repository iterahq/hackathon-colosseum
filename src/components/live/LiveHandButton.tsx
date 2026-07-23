import { Hand } from 'lucide-react';
import { useI18n } from '@/i18n';

interface LiveHandButtonProps {
  raised: boolean;
  onToggle: () => void;
}

/**
 * Learner-only toggle to raise/lower their hand — pinned inline beside the
 * timer in the top chrome (never a bottom-right floater, which read as broken
 * on phones). Compact pill matching the LIVE pill height; the label collapses
 * to an icon-only tap target on narrow screens so it never crowds the timer.
 */
export function LiveHandButton({ raised, onToggle }: LiveHandButtonProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="live-hand-btn"
      data-raised={raised ? 'true' : 'false'}
      aria-pressed={raised}
      aria-label={raised ? t('live.hand.lower') : t('live.hand.raise')}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full border text-xs font-medium transition-colors ${
        raised
          ? 'bg-clay text-white border-clay animate-pulse'
          : 'bg-card text-foreground border-border hover:border-clay/50'
      }`}
    >
      <Hand className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{raised ? t('live.hand.lower') : t('live.hand.raise')}</span>
    </button>
  );
}
