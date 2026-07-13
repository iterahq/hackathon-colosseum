import { Trophy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { ClassRanking } from '@/types/liveClass';

interface LiveRankingCardProps {
  ranking: ClassRanking;
  /** Render as a flush section inside a sidebar panel (drops the card chrome). */
  bare?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Instructor-only leaderboard of the present learners by answer speed (fastest
 * cumulative time first). Peer times stay off the student surface — this mirrors
 * why the answerers card hides correctness/elapsed from students.
 */
export function LiveRankingCard({ ranking, bare = false }: LiveRankingCardProps) {
  const { t } = useI18n();
  const { ranked, waiting } = ranking;

  return (
    <div className={bare ? 'p-5' : 'rounded-3xl border border-border bg-card p-5'} data-testid="live-ranking-card">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-clay" />
        <h3 className="font-display text-foreground text-sm">{t('live.instructor.ranking.title')}</h3>
        <span className="ml-auto font-mono text-sm tabular-nums text-clay" data-testid="live-ranking-count">
          {ranked.length}
        </span>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('live.instructor.ranking.empty')}</p>
      ) : (
        <ol className="space-y-1.5 max-h-64 overflow-y-auto lg:max-h-none lg:overflow-visible" data-testid="live-ranking-list">
          {ranked.map((r) => (
            <li
              key={r.userId}
              className="flex items-center gap-2 text-sm"
              data-testid="live-ranking-row"
              data-rank={r.rank}
            >
              <span className="w-6 text-center font-mono tabular-nums text-muted-foreground flex-shrink-0">
                {MEDALS[r.rank - 1] ?? r.rank}
              </span>
              <LiveAvatar name={r.name} avatarUrl={r.avatarUrl} size="w-6 h-6" />
              <span className="text-foreground flex-1 min-w-0 break-words">{r.name}</span>
              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {r.correctCount}/{r.answeredCount}
                </span>
                <span
                  className="font-mono text-xs tabular-nums text-clay"
                  data-testid="live-ranking-time"
                >
                  {formatMmss(Math.round(r.totalMs / 1000))}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {waiting.length > 0 && (
        <ul className="mt-2 pt-2 border-t border-border/60 space-y-1.5" data-testid="live-ranking-waiting">
          {waiting.map((w) => (
            <li key={w.userId} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-6 text-center flex-shrink-0">·</span>
              <LiveAvatar name={w.name} avatarUrl={w.avatarUrl} size="w-5 h-5" />
              <span className="flex-1 min-w-0 break-words">{w.name}</span>
              <span className="ml-auto text-xs flex-shrink-0">{t('live.instructor.ranking.waiting')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
