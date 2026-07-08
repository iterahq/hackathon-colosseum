import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useLiveMuted } from '@/hooks/useLiveMuted';
import { useLiveVolume } from '@/hooks/useLiveVolume';
import { useSoundEffects } from '@/hooks/useSoundEffects';

interface LiveSoundToggleProps {
  /** Icon-only round button (header) — gains a hover volume slider. */
  compact?: boolean;
}

export function LiveSoundToggle({ compact = false }: LiveSoundToggleProps) {
  const { t } = useI18n();
  const [muted, toggleMuted] = useLiveMuted();
  const [volume, setVolume] = useLiveVolume();
  const { play } = useSoundEffects();
  const label = muted ? t('live.sound.off') : t('live.sound.on');

  const handleToggle = () => {
    // Confirm-chime when turning sound back ON (muting stays silent — played
    // directly so the just-flipped mute preference doesn't gate it away).
    const turningOn = muted;
    toggleMuted();
    if (turningOn) play('chime', 0.4 * (volume || 1));
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    if (!muted && v > 0) play('click', 0.2 * v); // preview tick at the new level
  };

  const button = (
    <button
      type="button"
      onClick={handleToggle}
      data-testid="live-sound-toggle"
      data-muted={muted ? 'true' : 'false'}
      aria-pressed={muted}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={
        compact
          ? 'inline-flex items-center justify-center w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:border-menta/50 hover:text-foreground transition-colors'
          : 'w-full inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground hover:border-menta/50 hover:text-foreground transition-colors'
      }
    >
      {muted ? (
        <VolumeX className="w-4 h-4" />
      ) : volume < 0.5 ? (
        <Volume1 className="w-4 h-4 text-menta" />
      ) : (
        <Volume2 className="w-4 h-4 text-menta" />
      )}
      {!compact && label}
    </button>
  );

  if (!compact) return button;

  // Header slot: the icon toggle, plus a volume slider that reveals on hover/focus.
  return (
    <div className="relative group" data-testid="live-sound-control">
      {button}
      <div className="absolute right-0 top-full z-40 pt-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-lg">
          <VolumeX className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => handleVolume(parseFloat(e.target.value))}
            data-testid="live-volume-slider"
            aria-label={t('live.sound.volume')}
            className="w-28 accent-menta cursor-pointer"
          />
          <Volume2 className="w-3.5 h-3.5 text-menta shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
