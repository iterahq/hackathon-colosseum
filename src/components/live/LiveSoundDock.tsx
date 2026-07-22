import { Volume2, Volume1, VolumeX, Music, Music2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useLiveMuted } from '@/hooks/useLiveMuted';
import { useLiveVolume } from '@/hooks/useLiveVolume';
import { useLiveMusicEnabled } from '@/hooks/useLiveMusicEnabled';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import { useBackgroundMusic } from '@/hooks/useBackgroundMusic';

/**
 * Floating bottom-left sound dock for the live class: a mute toggle, a volume
 * slider that opens UPWARD on hover/focus, and a background-music switch. Also
 * HOSTS the gamified background-music loop, so mounting the dock on a live
 * surface starts (and gates) the soundtrack. Shared by learner + instructor.
 */
export function LiveSoundDock() {
  const { t } = useI18n();
  const [muted, toggleMuted] = useLiveMuted();
  const [volume, setVolume] = useLiveVolume();
  const [musicOn, toggleMusic] = useLiveMusicEnabled();
  const { play } = useSoundEffects();

  useBackgroundMusic({ enabled: musicOn, muted, volume });

  const label = muted ? t('live.sound.off') : t('live.sound.on');

  const handleToggle = () => {
    // Confirm-chime when turning sound back ON (muting stays silent — played
    // directly so the just-flipped mute preference doesn't gate it away).
    const turningOn = muted;
    toggleMuted();
    if (turningOn && volume > 0) play('chime', 0.4 * volume);
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    if (!muted && v > 0) play('click', 0.2 * v); // preview tick at the new level
  };

  const handleMusic = () => {
    const turningOn = !musicOn;
    toggleMusic();
    if (turningOn && !muted && volume > 0) play('chime', 0.3 * volume);
  };

  return (
    <div className="fixed bottom-5 left-5 z-40 group" data-testid="live-sound-dock">
      <div className="absolute left-0 bottom-full w-44 pb-1 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <VolumeX className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => handleVolume(parseFloat(e.target.value))}
              data-testid="live-volume-slider"
              aria-label={t('live.sound.volume')}
              className="flex-1 accent-menta cursor-pointer"
            />
            <Volume2 className="w-3.5 h-3.5 text-menta shrink-0" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={handleMusic}
            data-testid="live-music-toggle"
            data-on={musicOn ? 'true' : 'false'}
            aria-pressed={musicOn}
            className={`inline-flex items-center justify-center gap-2 h-9 rounded-full border text-xs font-medium transition-colors ${
              musicOn
                ? 'border-menta/50 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {musicOn ? <Music className="w-3.5 h-3.5 text-menta" /> : <Music2 className="w-3.5 h-3.5" />}
            {musicOn ? t('live.music.on') : t('live.music.off')}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleToggle}
        data-testid="live-sound-toggle"
        data-muted={muted ? 'true' : 'false'}
        aria-pressed={muted}
        aria-label={label}
        title={label}
        className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-border bg-card text-muted-foreground shadow-lg hover:border-menta/50 hover:text-foreground transition-colors"
      >
        {muted ? (
          <VolumeX className="w-4 h-4" />
        ) : volume < 0.5 ? (
          <Volume1 className="w-4 h-4 text-menta" />
        ) : (
          <Volume2 className="w-4 h-4 text-menta" />
        )}
      </button>
    </div>
  );
}
