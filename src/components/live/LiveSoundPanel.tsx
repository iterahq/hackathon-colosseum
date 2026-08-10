import { Music, Music2 } from 'lucide-react';
import { useI18n } from '@/i18n';

// Discrete volume presets — tappable percentage chips replace the drag slider,
// which was fiddly on touch (no hover to reveal it, hard to land a value).
const VOLUME_STEPS = [0, 0.1, 0.25, 0.5, 0.75, 1] as const;

interface LiveSoundPanelProps {
  volumePct: number;
  onVolume: (v: number) => void;
  musicOn: boolean;
  onMusic: () => void;
}

/** Painel do dock de som: porcentagens de volume + chave da música de fundo. */
export function LiveSoundPanel({ volumePct, onVolume, musicOn, onMusic }: LiveSoundPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {t('live.sound.volume')}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-menta" data-testid="live-volume-value">
          {volumePct}%
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('live.sound.volume')}>
        {VOLUME_STEPS.map((step) => {
          const pct = Math.round(step * 100);
          const active = volumePct === pct;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => onVolume(step)}
              data-testid={`live-volume-${pct}`}
              aria-pressed={active}
              className={`rounded-lg border py-2.5 text-[11px] font-medium tabular-nums transition-colors ${
                active
                  ? 'border-menta/50 bg-menta/10 text-menta'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-menta/40'
              }`}
            >
              {pct}%
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onMusic}
        data-testid="live-music-toggle"
        data-on={musicOn ? 'true' : 'false'}
        aria-pressed={musicOn}
        className={`inline-flex items-center justify-center gap-2 h-9 rounded-full border text-xs font-medium transition-colors ${
          musicOn ? 'border-menta/50 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        {musicOn ? <Music className="w-3.5 h-3.5 text-menta" /> : <Music2 className="w-3.5 h-3.5" />}
        {musicOn ? t('live.music.on') : t('live.music.off')}
      </button>
    </div>
  );
}
