import { useState, type ReactNode } from 'react';
import { Link2, Check, Square, Users, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { LiveRankedRosterCard } from '@/components/live/LiveRankedRosterCard';

interface LiveSidebarProps {
  /** Learner and instructor share this ONE sidebar; the role toggles sections. */
  role: 'learner' | 'instructor';
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  selfUserId?: string;
  /** Instructor only — hidden during reception (no current activity). */
  hasActivity?: boolean;
  activityIndex?: number;
  activityCount?: number;
  kind?: string;
  ranking?: ClassRanking;
  /** Learners who dropped presence — dimmed + blinking in the roster. */
  disconnectedUserIds?: string[];
  copied?: boolean;
  busy?: boolean;
  onCopyLink?: () => void;
  onEnd?: () => void;
  /** Instructor flow controls, rendered as the top section (no bottom bar). */
  controls?: ReactNode;
}

/**
 * The single right-hand live-class sidebar. Both roles see ONE ranked class
 * list (podium order, kept live); the instructor adds stats + manage actions.
 */
export function LiveSidebar({
  role,
  roster,
  answerers,
  selfUserId,
  hasActivity = true,
  activityIndex = 0,
  activityCount = 0,
  kind = '',
  ranking,
  disconnectedUserIds,
  copied = false,
  busy = false,
  onCopyLink,
  onEnd,
  controls,
}: LiveSidebarProps) {
  const { t } = useI18n();
  const isInstructor = role === 'instructor';
  const showActivity = isInstructor && hasActivity;

  const collapsible = !isInstructor;
  const [open, setOpen] = useState(false);
  const bodyClass = collapsible
    ? `min-h-0 divide-y divide-border lg:flex-1 lg:block lg:max-h-none lg:overflow-y-auto ${open ? 'max-h-[45vh] overflow-y-auto' : 'hidden'}`
    : 'flex-1 min-h-0 lg:overflow-y-auto divide-y divide-border';

  return (
    <aside
      className="w-full lg:w-[340px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col lg:sticky lg:top-0 lg:h-dvh lg:pt-4"
      data-testid={isInstructor ? 'instructor-sidebar' : 'live-sidebar'}
    >
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="live-sidebar-toggle"
          className="lg:hidden flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Users className="w-4 h-4" /> {t('live.sidebar.classroom')}
            <span className="text-muted-foreground/70">· {t('live.sidebar.online', { count: String(roster.length) })}</span>
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Teto de altura: o picker de palco abre aqui e empurraria Copiar link/Encerrar pra fora do dvh. */}
      {isInstructor && (controls || showActivity) && (
        <div className="shrink-0 max-h-[62vh] overflow-y-auto divide-y divide-border border-b border-border">
          {showActivity && activityCount > 0 && (
            <div className="py-2.5 flex justify-center">
              <span
                className="font-mono text-sm tabular-nums text-clay"
                data-testid="live-position"
              >
                {activityIndex + 1}/{activityCount}
              </span>
            </div>
          )}
          {controls}
          {showActivity && (
            <LiveActivityStatsCard bare kind={kind} answerers={answerers} />
          )}
        </div>
      )}

      <div className={bodyClass}>
        {!isInstructor && hasActivity && (
          <LiveActivityStatsCard bare hideCorrectness kind={kind} answerers={answerers} />
        )}
        {ranking && (
          <LiveRankedRosterCard
            bare
            ranking={ranking}
            answerers={answerers}
            instructors={roster.filter((m) => m.isInstructor)}
            raisedUserIds={roster.filter((m) => m.handRaised).map((m) => m.userId)}
            disconnectedUserIds={disconnectedUserIds}
            selfUserId={selfUserId}
            showDetail={isInstructor}
          />
        )}
      </div>

      {isInstructor && (
        <div className="shrink-0 border-t border-border p-5 space-y-2.5">
          <button
            onClick={onCopyLink}
            data-testid="instructor-copy-link"
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-menta/50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-menta" /> {t('live.instructor.copyLinkDone')}
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" /> {t('live.instructor.copyLink')}
              </>
            )}
          </button>
          <button
            onClick={onEnd}
            disabled={busy}
            data-testid="instructor-end"
            className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-full border border-destructive/40 bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5" /> {t('live.instructor.control.end')}
          </button>
        </div>
      )}
    </aside>
  );
}
