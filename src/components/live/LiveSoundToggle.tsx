import { Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useLiveMuted } from '@/hooks/useLiveMuted';

export function LiveSoundToggle() {
  const { t } = useI18n();
  const [muted, toggleMuted] = useLiveMuted();

  return (
    <button
      type="button"
      onClick={toggleMuted}
      data-testid="live-sound-toggle"
      data-muted={muted ? 'true' : 'false'}
      aria-pressed={muted}
      className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground hover:border-menta/50 hover:text-foreground transition-colors"
    >
      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-menta" />}
      {muted ? t('live.sound.off') : t('live.sound.on')}
    </button>
  );
}
