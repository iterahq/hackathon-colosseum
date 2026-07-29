import { useState } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveRosterBadges } from '@/components/live/LiveRosterBadges';
import { LiveRoomStateIcon } from '@/components/live/LiveRoomStateIcon';
import { LiveRoomRowActionsBar } from '@/components/live/LiveRoomRowActionsBar';
import type { LiveRoomRow as Row, LiveRoomRowActions } from '@/types/liveClass';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * One person in the live room, in cumulative podium order. `layout` is what
 * makes the standings READ as live: a learner who just overtook someone slides
 * past them instead of teleporting, which is the whole point of keeping the
 * ranking in the list rather than on an end-of-class screen.
 */
export function LiveRoomRow({
  row,
  compact = false,
  showDetail = false,
  actions,
}: {
  row: Row;
  compact?: boolean;
  /** Instructor view: correctness + cumulative score. Learners see neither. */
  showDetail?: boolean;
  actions?: LiveRoomRowActions;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const done = row.state === 'done';
  const wrong = row.state === 'wrong';
  const onStage = actions?.onStage === true;

  return (
    <motion.li
      layout
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      className={`group relative flex items-center rounded-xl ${open ? 'gap-1.5' : 'gap-3'} ${
        compact ? 'py-1.5 px-2' : 'py-2 px-2.5'
      } ${row.down ? 'opacity-60' : ''} ${
        done ? 'bg-evergreen-soft/40' : wrong && showDetail ? 'bg-destructive/5' : 'hover:bg-muted/40'
      }`}
      data-testid="live-room-row"
      data-state={showDetail ? row.state : done || wrong ? 'answered' : 'pending'}
      data-rank={row.rank ?? ''}
      data-on-stage={onStage ? 'true' : 'false'}
    >
      {open && actions ? (
        <LiveRoomRowActionsBar row={row} actions={actions} onClose={() => setOpen(false)} />
      ) : (
        <>
          <span
            className={`w-6 shrink-0 text-center font-mono tabular-nums ${
              row.rank && row.rank <= 3 ? 'text-base' : 'text-sm'
            } ${done ? 'text-evergreen-hi' : 'text-muted-foreground/50'}`}
          >
            {row.rank ? MEDALS[row.rank - 1] ?? row.rank : '·'}
          </span>

          <span className="relative shrink-0">
            <LiveAvatar name={row.name} avatarUrl={row.avatarUrl} size={compact ? 'w-6 h-6' : 'w-7 h-7'} />
            {onStage && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-streak ring-2 ring-card"
                data-testid="live-room-stage-dot"
                aria-hidden
              />
            )}
          </span>

          <span className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className={`truncate text-sm ${done || wrong ? 'text-foreground' : 'text-muted-foreground'}`}>
              {row.name}
            </span>
            <LiveRosterBadges
              userId={row.userId}
              selfUserId={row.isSelf ? row.userId : undefined}
              raised={row.raised}
              down={row.down}
              guest={row.guest}
            />
          </span>

          {/* Info and the ⋯ share ONE fixed slot, so opening the actions never
              reflows the row and the name never jumps under the pointer. */}
          <span className={`relative shrink-0 h-6 ${showDetail ? 'w-[86px]' : 'w-[58px]'}`}>
            <span
              className={`absolute inset-0 flex items-center justify-end gap-2 transition-opacity ${
                actions ? 'group-hover:opacity-0 group-focus-within:opacity-0' : ''
              }`}
            >
              {showDetail && (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {row.correctCount}/{row.answeredCount}
                </span>
              )}
              {typeof row.elapsedMs === 'number' && row.state !== 'pending' && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="live-room-time">
                  {formatMmss(Math.round(row.elapsedMs / 1000))}
                </span>
              )}
              <LiveRoomStateIcon state={row.state} working={row.working} showDetail={showDetail} />
            </span>

            {/* `[@media(hover:none)]` keeps the ⋯ reachable by touch — the class
                is run from a tablet as often as from a laptop. */}
            {actions && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={t('live.room.actions.open', { name: row.name })}
                aria-haspopup="true"
                data-testid="live-room-actions-open"
                className="absolute inset-y-0 right-0 w-7 grid place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:bg-muted group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-evergreen/50"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </span>
        </>
      )}

      {/* The pull is peer-to-peer: an offline learner can never answer it. Say
          that out loud instead of spinning forever. */}
      {actions?.unreachable && !actions.pending && (
        <span className="absolute -bottom-1 left-11 text-[10px] text-muted-foreground" data-testid="live-room-unreachable">
          {t('live.stage.picker.unreachable')}
        </span>
      )}
    </motion.li>
  );
}
