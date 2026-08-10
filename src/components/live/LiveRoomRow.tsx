import { motion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveRosterBadges } from '@/components/live/LiveRosterBadges';
import { LiveRoomStateIcon } from '@/components/live/LiveRoomStateIcon';
import { LiveRoomScore } from '@/components/live/LiveRoomScore';
import { LiveRoomRowActionsBar } from '@/components/live/LiveRoomRowActionsBar';
import { LiveRoomActionsToggle } from '@/components/live/LiveRoomActionsToggle';
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
  open = false,
  onOpenChange,
}: {
  row: Row;
  compact?: boolean;
  /** Instructor view: correctness + cumulative score. Learners see neither. */
  showDetail?: boolean;
  actions?: LiveRoomRowActions;
  /** Controlled by the list, which freezes the podium reorder while open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const done = row.state === 'done';
  const wrong = row.state === 'wrong';
  const onStage = actions?.onStage === true;

  return (
    <motion.li
      layout
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      className={`group relative flex ${open ? 'items-start gap-1.5' : 'items-center gap-3'} rounded-xl ${
        compact ? 'py-1.5 px-2' : 'py-2 px-2.5'
      } ${row.down ? 'opacity-60' : ''} ${
        done ? 'bg-evergreen-soft/40' : wrong && showDetail ? 'bg-destructive/5' : 'hover:bg-muted/40'
      }`}
      data-testid="live-room-row"
      data-state={showDetail ? row.state : done || wrong ? 'answered' : 'pending'}
      data-rank={row.rank ?? ''}
      data-on-stage={onStage ? 'true' : 'false'}
    >
      {actions && (
        <LiveRoomActionsToggle name={row.name} open={open} onToggle={() => onOpenChange?.(!open)} />
      )}

      {open && actions ? (
        <LiveRoomRowActionsBar row={row} actions={actions} onClose={() => onOpenChange?.(false)} />
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
          <span
            className={`relative shrink-0 h-6 ${
              showDetail ? (row.stars > 0 ? 'w-[132px]' : 'w-[100px]') : 'w-[58px]'
            }`}
          >
            <span
              // Inerte ao toque: cobre o mesmo canto do ⋯ e engolia o tap.
              className={`absolute inset-0 flex items-center justify-end gap-2 pointer-events-none transition-opacity ${
                actions ? 'group-hover:opacity-0 group-has-[:focus-visible]:opacity-0' : ''
              }`}
            >
              {showDetail && (
                <LiveRoomScore correct={row.correctCount} answered={row.answeredCount} stars={row.stars} />
              )}
              {typeof row.elapsedMs === 'number' && row.state !== 'pending' && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="live-room-time">
                  {formatMmss(Math.round(row.elapsedMs / 1000))}
                </span>
              )}
              <LiveRoomStateIcon state={row.state} working={row.working} showDetail={showDetail} />
            </span>

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
