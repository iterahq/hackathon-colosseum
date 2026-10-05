import { useEffect, useRef, useState } from 'react';
import { Volume2, Volume1, VolumeX, ChevronUp } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveSoundPanel } from '@/components/live/LiveSoundPanel';
import { useLiveMuted } from '@/hooks/useLiveMuted';
import { useLiveVolume } from '@/hooks/useLiveVolume';
import { useLiveMusicEnabled } from '@/hooks/useLiveMusicEnabled';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import { useBackgroundMusic } from '@/hooks/useBackgroundMusic';

/**
 * Sound dock for the live class, pinned bottom-LEFT: a mute toggle, a panel that
 * opens UPWARD with tappable volume percentages, and a background-music switch.
 * Also HOSTS the gamified background-music loop, so mounting the dock on a live
 * surface starts (and gates) the soundtrack. Shared by learner + instructor.
 */
interface LiveSoundDockProps {
  /**
   * Sobe o dock acima do `FeedbackFooter` (fixed, bottom-0, z-50). O footer fica
   * no ar do momento em que o aluno responde até o professor avançar — ou seja, a
   * maior parte da rodada —, então sem isso o dock fica enterrado embaixo dele.
   */
  raised?: boolean;
}

export function LiveSoundDock({ raised = false }: LiveSoundDockProps) {
  const { t } = useI18n();
  const [muted, toggleMuted] = useLiveMuted();
  const [volume, setVolume] = useLiveVolume();
  const [musicOn, toggleMusic] = useLiveMusicEnabled();
  const { play } = useSoundEffects();
  // No touch não existe hover nem foco de botão (iOS Safari), então o painel
  // abre só por clique: com hover no meio, `aria-expanded` mentia.
  const [open, setOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useBackgroundMusic({ enabled: musicOn, muted, volume });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!dockRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const label = muted ? t('live.sound.off') : t('live.sound.on');
  const volumePct = Math.round(volume * 100);

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
    <div
      ref={dockRef}
      className={`fixed left-3 md:left-4 z-40 transition-[bottom] duration-200 ${raised ? 'bottom-32 md:bottom-24' : 'bottom-3'}`}
      data-testid="live-sound-dock"
      data-raised={raised ? 'true' : 'false'}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleToggle}
          data-testid="live-sound-toggle"
          data-muted={muted ? 'true' : 'false'}
          aria-pressed={muted}
          aria-label={label}
          title={label}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border bg-card text-muted-foreground shadow-xs hover:border-menta/50 hover:text-foreground transition-colors"
        >
          {muted ? (
            <VolumeX className="w-4 h-4" />
          ) : volume < 0.5 ? (
            <Volume1 className="w-4 h-4 text-menta" />
          ) : (
            <Volume2 className="w-4 h-4 text-menta" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="live-sound-panel-toggle"
          data-open={open ? 'true' : 'false'}
          aria-expanded={open}
          aria-controls="live-sound-panel"
          aria-label={t('live.sound.volume')}
          title={t('live.sound.volume')}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border bg-card text-muted-foreground shadow-xs hover:border-menta/50 hover:text-foreground transition-colors"
        >
          <ChevronUp className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div
        id="live-sound-panel"
        data-testid="live-sound-panel"
        className={`absolute left-0 bottom-full w-56 pb-1 transition-opacity duration-150 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <LiveSoundPanel
          volumePct={volumePct}
          onVolume={handleVolume}
          musicOn={musicOn}
          onMusic={handleMusic}
        />
      </div>
    </div>
  );
}
