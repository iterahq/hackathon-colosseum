import { Hand } from 'lucide-react';
import { useI18n } from '@/i18n';

interface LiveHandButtonProps {
  raised: boolean;
  onToggle: () => void;
}

/** Learner-only floating toggle to raise/lower their hand during a live class. */
export function LiveHandButton({ raised, onToggle }: LiveHandButtonProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="live-hand-btn"
      data-raised={raised ? 'true' : 'false'}
      aria-pressed={raised}
      className={`fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 h-11 pl-3.5 pr-4 rounded-full border text-sm font-medium shadow-lg transition-colors ${
        raised
          ? 'bg-clay text-white border-clay animate-pulse'
          : 'bg-card text-foreground border-border hover:border-clay/50'
      }`}
    >
      <Hand className="w-4 h-4" />
      {raised ? t('live.hand.lower') : t('live.hand.raise')}
    </button>
  );
}
