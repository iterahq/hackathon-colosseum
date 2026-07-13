import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { ClassRanking } from '@/types/liveClass';

// Left→right render order of the top three: 2nd, 1st, 3rd.
const PODIUM_ORDER = [1, 0, 2];
const MEDALS = ['🥇', '🥈', '🥉'];
const BAR_HEIGHTS = ['h-32 md:h-40', 'h-24 md:h-28', 'h-16 md:h-20'];

export function LivePodium({ ranking }: { ranking: ClassRanking }) {
  const { t } = useI18n();
  const top = ranking.ranked.slice(0, 3);
  const rest = ranking.ranked.slice(3);

  return (
    <div className="w-full" data-testid="live-podium">
      <div className="flex items-center justify-center gap-2 text-clay">
        <Trophy className="w-5 h-5" />
        <h2 className="font-display text-foreground">{t('live.podium.title')}</h2>
      </div>
      <p className="text-center text-sm text-muted-foreground mt-1">{t('live.podium.subtitle')}</p>

      {top.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="live-podium-empty">
          {t('live.podium.empty')}
        </p>
      ) : (
        <div className="mt-10 flex items-end justify-center gap-3 md:gap-4">
          {PODIUM_ORDER.map((rankIdx) => {
            const entry = top[rankIdx];
            if (!entry) return null;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 * (2 - rankIdx), type: 'spring', stiffness: 220, damping: 22 }}
                className="flex flex-col items-center w-24 md:w-28"
                data-testid="live-podium-place"
                data-rank={entry.rank}
              >
                <span className="text-2xl" aria-hidden="true">
                  {MEDALS[rankIdx]}
                </span>
                <LiveAvatar name={entry.name} avatarUrl={entry.avatarUrl} size="w-12 h-12" />
                <span className="mt-1.5 text-sm text-foreground text-center break-words w-full">{entry.name}</span>
                <span className="font-mono text-xs tabular-nums text-clay">
                  {t('live.podium.score', { n: String(entry.correctCount) })}
                </span>
                <div
                  className={`mt-2 w-full ${BAR_HEIGHTS[rankIdx]} rounded-t-2xl bg-clay/15 border border-clay/40 flex items-start justify-center pt-2`}
                >
                  <span className="font-display text-clay">{entry.rank}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <ol className="mt-6 max-w-md mx-auto space-y-1.5" data-testid="live-podium-rest">
          {rest.map((r) => (
            <li key={r.userId} className="flex items-center gap-2 text-sm" data-testid="live-podium-row" data-rank={r.rank}>
              <span className="w-6 text-center font-mono tabular-nums text-muted-foreground flex-shrink-0">{r.rank}</span>
              <LiveAvatar name={r.name} avatarUrl={r.avatarUrl} size="w-6 h-6" />
              <span className="text-foreground flex-1 min-w-0 break-words">{r.name}</span>
              <span className="ml-auto font-mono text-xs tabular-nums text-clay flex-shrink-0">
                {t('live.podium.score', { n: String(r.correctCount) })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
