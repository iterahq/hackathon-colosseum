import { Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveRoomRow } from '@/components/live/LiveRoomRow';
import type { ClassPresenceMember, LiveRoomRow as Row, LiveRoomRowActions } from '@/types/liveClass';

/**
 * The single class list of the live sidebar: everyone in the room, in cumulative
 * podium order, each row carrying its state on the current activity.
 *
 * It replaced the old roster + who's-answered + ranking stack — three sections
 * saying the same thing three times. The header's pulse bar is what the two
 * dropped sections were for: one line answers "quantos já responderam".
 */
export function LiveRoomList({
  rows,
  instructors,
  compact = false,
  showDetail = false,
  actionsFor,
}: {
  rows: Row[];
  instructors: ClassPresenceMember[];
  compact?: boolean;
  /** Instructor view: correctness + cumulative score per row. */
  showDetail?: boolean;
  /** Instructor only — undefined leaves the rows inert for learners. */
  actionsFor?: (row: Row) => LiveRoomRowActions;
}) {
  const { t } = useI18n();
  const total = rows.length;
  const answered = rows.filter((r) => r.state !== 'pending').length;
  const raised = rows.filter((r) => r.raised).length;
  const guests = rows.filter((r) => r.guest).length;
  const pct = total > 0 ? (answered / total) * 100 : 0;

  return (
    <section className={`flex-1 min-h-0 flex flex-col ${compact ? 'p-4' : 'p-5'}`} data-testid="live-room-list">
      <div className={compact ? 'mb-3' : 'mb-4'}>
        <div className="flex items-center gap-2 mb-2.5">
          <Users className="w-4 h-4 text-clay" />
          <h3 className="font-display text-foreground text-sm">{t('live.room.title')}</h3>
          {raised > 0 && (
            <span className="font-mono text-xs tabular-nums text-clay" data-testid="live-hand-count">
              ✋ {raised}
            </span>
          )}
          {/* Guest counter (ADR-12) — how many of the people in the room came in
              through the guest link. */}
          {guests > 0 && (
            <span className="font-mono text-xs tabular-nums text-clay" data-testid="live-guest-count">
              {t('live.guest.count', { n: String(guests) })}
            </span>
          )}
          <span className="ml-auto font-mono text-sm tabular-nums text-menta" data-testid="live-roster-count">
            {total + instructors.length}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full bg-evergreen transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0" data-testid="live-room-pulse">
            {t('live.room.answered', { answered: String(answered), total: String(total) })}
          </span>
        </div>

        {instructors.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="live-room-instructors">
            {instructors.map((m) => (
              <li key={m.userId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-5 h-5" />
                {m.name}
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  · {t('live.rankedRoster.prof')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The only scrolling region of the panel — this is where 30 students fit. */}
      <ul className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-0.5" data-testid="live-room-rows">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground py-2">{t('live.instructor.roster.empty')}</li>
        ) : (
          rows.map((row) => (
            <LiveRoomRow
              key={row.userId}
              row={row}
              compact={compact}
              showDetail={showDetail}
              actions={actionsFor?.(row)}
            />
          ))
        )}
      </ul>
    </section>
  );
}
