import { useState, type ReactNode } from 'react';
import { useCompactHeight } from '@/hooks/useCompactHeight';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { LivePalcoBanner } from '@/components/live/LivePalcoBanner';
import { LiveRoomList } from '@/components/live/LiveRoomList';
import { LiveSidebarActions } from '@/components/live/LiveSidebarActions';
import { LiveSidebarFlow } from '@/components/live/LiveSidebarFlow';
import { LiveSidebarToggle } from '@/components/live/LiveSidebarToggle';
import { roomActionsFactory } from '@/utils/liveRoomActions';
import type { ClassAnswerer, ClassPresenceMember, LiveRoomModeration, LiveRoomRow, StagedAuthor } from '@/types/liveClass';

interface LiveSidebarProps {
  /** Learner and instructor share this ONE sidebar; the role toggles sections. */
  role: 'learner' | 'instructor';
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  /** The single ordered room list (see utils/liveRoomRows). */
  rows: LiveRoomRow[];
  /** Instructor only — hidden during reception (no current activity). */
  hasActivity?: boolean;
  activityIndex?: number;
  activityCount?: number;
  copied?: boolean;
  busy?: boolean;
  onCopyLink?: () => void;
  onCopyGuestLink?: () => void;
  guestCopied?: boolean;
  guestLinkBusy?: boolean;
  onEnd?: () => void;
  /** Instructor flow controls, rendered as the top section (no bottom bar). */
  controls?: ReactNode;
  /** Instructor: whose work is on the class stage right now. */
  stagedAuthor?: StagedAuthor | null;
  stagePendingUserId?: string | null;
  stageUnreachableUserId?: string | null;
  /** Instructor: pull this learner's work onto the stage (or take it off). */
  onToggleStage?: (userId: string) => void;
  /** Instructor: lower hand and remove. Absent leaves the rows inert. */
  moderation?: LiveRoomModeration;
  /** Learner: raise-hand toggle, pinned above the list so it is never missed. */
  handSlot?: ReactNode;
}

/**
 * The single right-hand live-class sidebar. Both roles see ONE room list (podium
 * order, kept live); the instructor adds stats, the stage banner and the
 * per-student actions — which is where "puxar pro palco" moved to, replacing the
 * separate collapsible picker that duplicated the whole class list.
 */
export function LiveSidebar({
  role,
  roster,
  answerers,
  rows,
  hasActivity = true,
  activityIndex = 0,
  activityCount = 0,
  copied = false,
  busy = false,
  onCopyLink,
  onCopyGuestLink,
  guestCopied = false,
  guestLinkBusy = false,
  onEnd,
  controls,
  stagedAuthor,
  stagePendingUserId,
  stageUnreachableUserId,
  onToggleStage,
  moderation,
  handSlot,
}: LiveSidebarProps) {
  const compact = useCompactHeight();
  const isInstructor = role === 'instructor';
  const showActivity = isInstructor && hasActivity;
  const instructors = roster.filter((m) => m.isInstructor);

  const [open, setOpen] = useState(false);
  // A lista de alunos vira gaveta nos dois papéis: no celular a sidebar cai
  // embaixo da coluna inteira e, aberta, o professor rolava uma parede de nomes
  // pra chegar nos controles de encerrar.
  const bodyClass = `min-h-0 flex flex-col lg:flex-1 lg:max-h-none lg:flex ${open ? 'max-h-[45dvh]' : 'hidden'}`;

  // Only while an activity is on screen: there is nothing to pull during reception.
  const actionsFor = showActivity
    ? roomActionsFactory({ moderation, onToggleStage, stagedAuthor, stagePendingUserId, stageUnreachableUserId })
    : undefined;

  return (
    <aside
      className="w-full lg:w-[320px] xl:w-[348px] wide:w-[380px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col lg:sticky lg:top-0 lg:h-dvh lg:pt-4"
      data-testid={isInstructor ? 'instructor-sidebar' : 'live-sidebar'}
      data-compact={compact ? 'true' : 'false'}
    >
      <LiveSidebarToggle open={open} count={roster.length} onToggle={() => setOpen((o) => !o)} />

      {handSlot && <div className="hidden lg:block px-4 pb-3 border-b border-border">{handSlot}</div>}

      {isInstructor && (controls || showActivity) && (
        <LiveSidebarFlow
          showActivity={showActivity}
          activityIndex={activityIndex}
          activityCount={activityCount}
          answerers={answerers}
          compact={compact}
          controls={controls}
        />
      )}

      {isInstructor && (
        <LivePalcoBanner
          author={stagedAuthor ?? null}
          compact={compact}
          onClear={() => stagedAuthor && onToggleStage?.(stagedAuthor.userId)}
        />
      )}

      <div className={bodyClass}>
        {!isInstructor && hasActivity && (
          <LiveActivityStatsCard bare compact={compact} hideCorrectness answerers={answerers} />
        )}
        <LiveRoomList rows={rows} instructors={instructors} compact={compact} showDetail={isInstructor} actionsFor={actionsFor} />
      </div>

      {isInstructor && (
        <LiveSidebarActions
          compact={compact}
          copied={copied}
          busy={busy}
          onCopyLink={onCopyLink}
          onCopyGuestLink={onCopyGuestLink}
          guestCopied={guestCopied}
          guestLinkBusy={guestLinkBusy}
          onEnd={onEnd}
        />
      )}
    </aside>
  );
}
