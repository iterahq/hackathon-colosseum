import { motion } from 'framer-motion';
import { Trophy, Crown } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveGuestBadge } from '@/components/live/LiveGuestBadge';
import { formatMmss } from '@/utils/formatMmss';
import type { ClassRanking } from '@/types/liveClass';

// Left→right render order of the top three: 2nd, 1st, 3rd.
const PODIUM_ORDER = [1, 0, 2];
const MEDALS = ['🥇', '🥈', '🥉'];
const BAR_HEIGHTS = ['h-32 md:h-40', 'h-24 md:h-28', 'h-16 md:h-20'];
// Gold / silver / bronze tints so each step reads as its own tier.
const BAR_TINTS = ['bg-amber-400/15 border-amber-400/50 text-amber-500', 'bg-slate-300/15 border-slate-400/50 text-slate-400', 'bg-orange-400/15 border-orange-500/50 text-orange-500'];

export function LivePodium({
  ranking,
  selfUserId,
  guestUserIds,
}: {
  ranking: ClassRanking;
  selfUserId?: string;
  /** Durable guest list (itera.class_guests), merged over the presence flag. */
  guestUserIds?: string[];
}) {
  const { t } = useI18n();
  const top = ranking.ranked.slice(0, 3);
  const rest = ranking.ranked.slice(3);
  const guests = new Set(guestUserIds ?? []);
  // A guest CAN win the podium (ADR-9 accepts it); the badge is what keeps that
  // honest next to a real student with the same self-declared name (ADR-11).
  const isGuest = (userId: string, flagged?: boolean) => flagged === true || guests.has(userId);

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
        <div className="mt-10 flex items-end justify-center gap-2 sm:gap-3 md:gap-4">
          {PODIUM_ORDER.map((rankIdx) => {
            const entry = top[rankIdx];
            if (!entry) return null;
            const isSelf = Boolean(selfUserId) && entry.userId === selfUserId;
            const isWinner = rankIdx === 0;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 * (2 - rankIdx), type: 'spring', stiffness: 220, damping: 22 }}
                className="flex flex-col items-center w-20 sm:w-24 md:w-28"
                data-testid="live-podium-place"
                data-rank={entry.rank}
                data-self={isSelf ? 'true' : 'false'}
              >
                {isWinner ? (
                  <motion.span
                    aria-hidden="true"
                    className="text-amber-400"
                    animate={{ y: [0, -4, 0], rotate: [-6, 6, -6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Crown className="w-6 h-6" fill="currentColor" />
                  </motion.span>
                ) : (
                  <span className="text-2xl" aria-hidden="true">
                    {MEDALS[rankIdx]}
                  </span>
                )}
                <div className={isSelf ? 'rounded-full ring-2 ring-menta ring-offset-2 ring-offset-card' : ''}>
                  <LiveAvatar name={entry.name} avatarUrl={entry.avatarUrl} size="w-12 h-12" />
                </div>
                <span className="mt-1.5 text-sm text-foreground text-center wrap-break-word w-full">{entry.name}</span>
                {isGuest(entry.userId, entry.isGuest) && <LiveGuestBadge className="mt-0.5" />}
                {isSelf && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-menta">{t('live.podium.you')}</span>
                )}
                <span className="font-mono text-xs tabular-nums text-clay">
                  {t('live.podium.score', { n: String(entry.correctCount) })}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground" data-testid="live-podium-time">
                  {formatMmss(entry.totalMs / 1000)}
                </span>
                <div className={`mt-2 w-full ${BAR_HEIGHTS[rankIdx]} rounded-t-2xl border flex items-start justify-center pt-2 ${BAR_TINTS[rankIdx]}`}>
                  <span className="font-display">{entry.rank}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <ol className="mt-6 max-w-md mx-auto space-y-1.5" data-testid="live-podium-rest">
          {rest.map((r) => {
            const isSelf = Boolean(selfUserId) && r.userId === selfUserId;
            return (
              <li
                key={r.userId}
                className={`flex items-center gap-2 text-sm rounded-xl px-2 py-1 ${isSelf ? 'bg-menta/10 ring-1 ring-menta/40' : ''}`}
                data-testid="live-podium-row"
                data-rank={r.rank}
                data-self={isSelf ? 'true' : 'false'}
              >
                <span className="w-6 text-center font-mono tabular-nums text-muted-foreground shrink-0">{r.rank}</span>
                <LiveAvatar name={r.name} avatarUrl={r.avatarUrl} size="w-6 h-6" />
                <span className="text-foreground flex-1 min-w-0 wrap-break-word">
                  {r.name}
                  {isGuest(r.userId, r.isGuest) && <LiveGuestBadge className="ml-1.5" />}
                  {isSelf && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-menta">{t('live.podium.you')}</span>}
                </span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {formatMmss(r.totalMs / 1000)}
                </span>
                <span className="font-mono text-xs tabular-nums text-clay shrink-0">
                  {t('live.podium.score', { n: String(r.correctCount) })}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
