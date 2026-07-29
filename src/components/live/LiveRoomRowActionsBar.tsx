import { Loader2, MonitorPlay, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { LiveRoomRow, LiveRoomRowActions } from '@/types/liveClass';

/**
 * The professor's actions for one learner, rendered INLINE on the row itself
 * rather than in a popover: the room list is `overflow-y-auto` and would clip
 * anything positioned on top of it.
 *
 * Only "puxar pro palco" lives here (DTQ-2, Tainan 2026-07-28: move what already
 * exists, invent nothing) — it replaced the separate collapsible picker, so the
 * professor acts on the student where the student already is.
 */
export function LiveRoomRowActionsBar({
  row,
  actions,
  onClose,
}: {
  row: LiveRoomRow;
  actions: LiveRoomRowActions;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { onStage } = actions;

  return (
    <>
      <LiveAvatar name={row.name} avatarUrl={row.avatarUrl} size="w-6 h-6" />
      <span className="flex-1 min-w-0 truncate text-sm text-foreground">{row.name}</span>
      <button
        type="button"
        onClick={() => actions.onToggleStage(row.userId)}
        disabled={actions.pending}
        aria-label={t(onStage ? 'live.room.stage.off' : 'live.room.stage.on', { name: row.name })}
        data-testid="live-room-stage"
        className={`h-8 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded-full border text-[11px] font-medium transition-colors disabled:opacity-60 ${
          onStage
            ? 'border-clay bg-clay text-obsidiana hover:bg-clay/90'
            : 'border-clay/40 bg-clay/10 text-clay hover:bg-clay/20'
        }`}
      >
        {actions.pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" data-testid="live-room-stage-pending" />
        ) : (
          <MonitorPlay className="w-3.5 h-3.5" />
        )}
        {t(onStage ? 'live.stage.picker.clear' : 'live.stage.picker.pull')}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('live.room.actions.close')}
        data-testid="live-room-actions-close"
        className="w-7 h-8 shrink-0 grid place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </>
  );
}
