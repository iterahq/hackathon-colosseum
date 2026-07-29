import { MonitorPlay, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { StagedAuthor } from '@/types/liveClass';

/**
 * Who is on the class stage right now. Sits above the room list and only exists
 * while someone is up there — the professor needs to know at a glance that the
 * class is looking at a student's screen and not at the activity.
 *
 * The entrance is a CSS `animate-fade-in`, NOT a framer-motion height animation:
 * a height animation that freezes mid-flight (the browser pauses rAF in a hidden
 * tab) leaves the banner at 1px and it never recovers, hiding the very state it
 * exists to announce. A critical state cannot depend on an animation to be seen.
 */
export function LivePalcoBanner({
  author,
  compact = false,
  onClear,
}: {
  author: StagedAuthor | null;
  compact?: boolean;
  onClear: () => void;
}) {
  const { t } = useI18n();
  if (!author) return null;

  return (
    <div className="shrink-0 border-b border-streak/30 bg-streak/10 animate-fade-in" data-testid="live-palco-banner">
      <div className={compact ? 'px-4 py-2' : 'px-5 py-3'}>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2" aria-hidden>
            <span className="absolute inline-flex w-full h-full rounded-full bg-streak opacity-70 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-streak" />
          </span>
          <MonitorPlay className="w-4 h-4 text-streak shrink-0" />
          <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-streak leading-none">
            {t('live.palco.title')}
          </h3>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-streak/80">
            {t('live.palco.live')}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-sm text-foreground">
          <LiveAvatar name={author.name} avatarUrl={author.avatarUrl} size={compact ? 'w-5 h-5' : 'w-6 h-6'} />
          <span className="flex-1 truncate">{author.name}</span>
          <button
            type="button"
            onClick={onClear}
            aria-label={t('live.palco.clear', { name: author.name })}
            data-testid="live-palco-clear"
            className="shrink-0 w-6 h-6 grid place-items-center rounded-full text-streak/70 hover:text-streak hover:bg-streak/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
