import { useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveRoomRow } from '@/components/live/LiveRoomRow';
import { LiveSectionTitle } from '@/components/live/LiveSectionTitle';
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
  // Com um menu aberto a lista PARA de reordenar. A ordem é o pódio, que se
  // reembaralha a cada resposta que chega — e "tirar da sala" clicado numa linha
  // que acabou de deslizar sob o dedo tira o aluno errado.
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const frozenOrder = useRef<string[] | null>(null);
  // Sai da sala (ou cai) com o menu aberto e ninguém fecha o menu — sem isto a
  // lista ficaria congelada até o fim da aula.
  if (!openUserId || !rows.some((r) => r.userId === openUserId)) frozenOrder.current = null;
  else frozenOrder.current ??= rows.map((r) => r.userId);

  const frozen = frozenOrder.current;
  const rank = new Map(frozen?.map((id, i) => [id, i]));
  const orderedRows = frozen
    ? [...rows].sort(
        (a, b) => (rank.get(a.userId) ?? frozen.length) - (rank.get(b.userId) ?? frozen.length)
      )
    : rows;

  const total = rows.length;
  const answered = rows.filter((r) => r.state !== 'pending').length;
  const raised = rows.filter((r) => r.raised).length;
  const guests = rows.filter((r) => r.guest).length;
  const pct = total > 0 ? (answered / total) * 100 : 0;

  return (
    <section className={`flex-1 min-h-0 flex flex-col ${compact ? 'p-4' : 'p-5'}`} data-testid="live-room-list">
      <div className={compact ? 'mb-3' : 'mb-4'}>
        <LiveSectionTitle icon={Users} title={t('live.room.title')} compact={compact}>
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
          <span className="ml-auto font-mono text-sm tabular-nums text-foreground/80" data-testid="live-roster-count">
            {total}
          </span>
        </LiveSectionTitle>

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
          <p
            className="mt-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            data-testid="live-room-instructors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-evergreen shrink-0" aria-hidden />
            {instructors.map((m) => m.name).join(' · ')} · {t('live.rankedRoster.prof')}
          </p>
        )}
      </div>

      {/* The only scrolling region of the panel — this is where 30 students fit. */}
      <ul className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-0.5" data-testid="live-room-rows">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground py-2">{t('live.instructor.roster.empty')}</li>
        ) : (
          orderedRows.map((row) => (
            <LiveRoomRow
              key={row.userId}
              row={row}
              compact={compact}
              showDetail={showDetail}
              actions={actionsFor?.(row)}
              open={openUserId === row.userId}
              onOpenChange={(next) => setOpenUserId(next ? row.userId : null)}
            />
          ))
        )}
      </ul>
    </section>
  );
}
