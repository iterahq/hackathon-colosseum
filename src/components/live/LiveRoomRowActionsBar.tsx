import { useState } from 'react';
import { Hand, Loader2, MonitorPlay, Star, StarOff, UserMinus } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveRoomActionButton } from '@/components/live/LiveRoomActionButton';
import type { LiveRoomRow, LiveRoomRowActions } from '@/types/liveClass';

/**
 * As ações do professor sobre UM aluno, renderizadas INLINE na própria linha e
 * não num popover: a lista da sala é `overflow-y-auto` e recortaria qualquer
 * coisa posicionada por cima.
 *
 * A divisão em faixas não é estética: o nome fica no cabeçalho, no meio o que se
 * usa várias vezes por aula (estrela, abaixar a mão, palco), e embaixo o que
 * corrige um engano ou encerra a participação. "Dar estrela" e "tirar da sala"
 * lado a lado no mesmo alvo de toque seriam vizinhos com consequências opostas.
 *
 * As ações moram numa faixa própria com `flex-wrap` porque a barra vive numa
 * sidebar de 320px: enfileiradas junto do nome elas estouravam a largura.
 * Fechar é o `LiveRoomActionsToggle` da linha, no mesmo canto do ⋯ que abriu.
 *
 * Tirar da sala confirma na própria linha — nunca em modal. A turma está vendo a
 * tela projetada, e um diálogo no centro transforma disciplina em julgamento
 * público.
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
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const { onStage } = actions;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 pr-11">
        <LiveAvatar name={row.name} avatarUrl={row.avatarUrl} size="w-6 h-6" />
        <span className="flex-1 min-w-0 truncate text-sm text-foreground">{row.name}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        <LiveRoomActionButton
          icon={Star}
          label={t('live.room.action.star')}
          onClick={() => actions.onStar(row.userId, 1)}
          tone="star"
          testId="live-room-star"
        />
        <LiveRoomActionButton
          icon={Hand}
          label={t('live.room.action.lowerHand')}
          onClick={() => actions.onLowerHand(row.userId)}
          disabled={!row.raised}
          testId="live-room-lower-hand"
        />
        <button
          type="button"
          onClick={() => actions.onToggleStage(row.userId)}
          disabled={actions.pending}
          aria-label={t(onStage ? 'live.room.stage.off' : 'live.room.stage.on', { name: row.name })}
          data-testid="live-room-stage"
          className={`h-8 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded-full border text-[11px] font-medium transition-colors disabled:opacity-60 ${
            onStage
              ? 'border-streak bg-streak text-obsidiana hover:bg-streak/90'
              : 'border-streak/40 bg-streak/10 text-streak hover:bg-streak/20'
          }`}
        >
          {actions.pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" data-testid="live-room-stage-pending" />
          ) : (
            <MonitorPlay className="w-3.5 h-3.5" />
          )}
          {t(onStage ? 'live.stage.picker.clear' : 'live.stage.picker.pull')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8 border-t border-border/50 pt-1.5">
        {confirmingRemove ? (
          <>
            <span className="flex-1 min-w-0 truncate text-[11px] text-muted-foreground">
              {t('live.room.action.removeConfirm', { name: row.name })}
            </span>
            <LiveRoomActionButton
              icon={UserMinus}
              label={t('live.room.action.removeYes')}
              onClick={() => {
                actions.onRemove(row.userId);
                setConfirmingRemove(false);
                onClose();
              }}
              tone="danger"
              testId="live-room-remove-confirm"
            />
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              data-testid="live-room-remove-cancel"
              className="h-8 px-2.5 shrink-0 rounded-full text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('live.room.action.removeNo')}
            </button>
          </>
        ) : (
          <>
            <LiveRoomActionButton
              icon={StarOff}
              label={t('live.room.action.unstar')}
              onClick={() => actions.onStar(row.userId, -1)}
              disabled={row.stars <= 0}
              testId="live-room-unstar"
            />
            <span className="flex-1" />
            <LiveRoomActionButton
              icon={UserMinus}
              label={t('live.room.action.remove')}
              onClick={() => setConfirmingRemove(true)}
              tone="danger"
              testId="live-room-remove"
            />
          </>
        )}
      </div>
    </div>
  );
}
