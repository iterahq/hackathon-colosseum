import { Trophy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';
import { answerStateVariant } from '@/utils/answerStateVariant';
import { ANSWER_STATE_ICONS } from '@/consts/answerStateIcons';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { ClassAnswerer, ClassPresenceMember, ClassRanking } from '@/types/liveClass';

interface LiveRankedRosterCardProps {
  /** Cumulative podium order (rankByScore) — the ONE list both roles see. */
  ranking: ClassRanking;
  /** Current-activity answer states, to badge each row (answered / pending). */
  answerers: ClassAnswerer[];
  instructors: ClassPresenceMember[];
  selfUserId?: string;
  /** Instructor view: correctness + cumulative score/time. Learners see order + answered-only. */
  showDetail?: boolean;
  /** Render as a flush section inside a sidebar panel (drops the card chrome). */
  bare?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * The single class list of the live sidebar — everyone in the room, learners
 * kept in PODIUM ORDER for the whole class (Educar+ round-2 ask: standings live
 * in the list, the podium screen itself only shows at the end). Replaces the
 * old roster + who's-answered + ranking stack that polluted the sidebar.
 */
export function LiveRankedRosterCard({
  ranking,
  answerers,
  instructors,
  selfUserId,
  showDetail = false,
  bare = false,
}: LiveRankedRosterCardProps) {
  const { t } = useI18n();
  const stateById = new Map(answerers.map((a) => [a.userId, a.state]));
  const youTag = (userId: string) =>
    userId === selfUserId ? (
      <span className="text-[10px] uppercase tracking-wide text-clay font-mono flex-shrink-0">
        · {t('live.instructor.roster.you')}
      </span>
    ) : null;

  return (
    <div className={bare ? 'p-5' : 'rounded-3xl border border-border bg-card p-5'} data-testid="live-ranked-roster-card">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-clay" />
        <h3 className="font-display text-foreground text-sm">{t('live.rankedRoster.title')}</h3>
        <span className="ml-auto font-mono text-sm tabular-nums text-menta" data-testid="live-roster-count">
          {ranking.ranked.length + ranking.waiting.length + instructors.length}
        </span>
      </div>

      {instructors.length > 0 && (
        <ul className="mb-2.5 space-y-1.5" data-testid="live-ranked-instructors">
          {instructors.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-6 text-center flex-shrink-0 text-[10px] uppercase font-mono">
                {t('live.rankedRoster.prof')}
              </span>
              <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-6 h-6" />
              <span className="flex-1 min-w-0 break-words">{m.name}</span>
              {youTag(m.userId)}
            </li>
          ))}
        </ul>
      )}

      {ranking.ranked.length === 0 && ranking.waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('live.instructor.roster.empty')}</p>
      ) : (
        <ol className="space-y-1.5 max-h-72 overflow-y-auto lg:max-h-none lg:overflow-visible" data-testid="live-ranked-list">
          {ranking.ranked.map((r) => (
            <li
              key={r.userId}
              className="flex items-center gap-2 text-sm"
              data-testid="live-ranked-row"
              data-rank={r.rank}
              data-state={answerStateVariant(stateById.get(r.userId), showDetail)}
            >
              <span className="w-6 text-center font-mono tabular-nums text-muted-foreground flex-shrink-0">
                {MEDALS[r.rank - 1] ?? r.rank}
              </span>
              <LiveAvatar name={r.name} avatarUrl={r.avatarUrl} size="w-6 h-6" />
              <span className="text-foreground flex-1 min-w-0 break-words">{r.name}</span>
              {youTag(r.userId)}
              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                {showDetail && (
                  <>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {r.correctCount}/{r.answeredCount}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-clay" data-testid="live-ranked-time">
                      {formatMmss(Math.round(r.totalMs / 1000))}
                    </span>
                  </>
                )}
                {ANSWER_STATE_ICONS[answerStateVariant(stateById.get(r.userId), showDetail)]}
              </span>
            </li>
          ))}
          {ranking.waiting.map((w) => (
            <li
              key={w.userId}
              className="flex items-center gap-2 text-sm text-muted-foreground"
              data-testid="live-ranked-waiting-row"
              data-state={answerStateVariant(stateById.get(w.userId), showDetail)}
            >
              <span className="w-6 text-center flex-shrink-0">·</span>
              <LiveAvatar name={w.name} avatarUrl={w.avatarUrl} size="w-6 h-6" />
              <span className="flex-1 min-w-0 break-words">{w.name}</span>
              {youTag(w.userId)}
              <span className="ml-auto flex-shrink-0">
                {ANSWER_STATE_ICONS[answerStateVariant(stateById.get(w.userId), showDetail)]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
