import { useState } from 'react';
import { ChevronDown, Hand, Loader2, MonitorPlay, UserMinus } from 'lucide-react';
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
 * usa várias vezes por aula (abaixar a mão, palco), e embaixo o que encerra a
 * participação.
 *
 * As ações moram numa faixa própria com `flex-wrap` porque a barra vive numa
 * sidebar de 320px: enfileiradas junto do nome elas estouravam a largura.
 * Fechar é o `LiveRoomActionsToggle` da linha, no mesmo canto do ⋯ que abriu.
 *
 * **Tirar da sala fica atrás de um "Mais" fechado por padrão.** Ele estava
 * visível ao lado do botão de palco e na primeira aula com alunos reais o
 * professor confundiu os dois — "tirar da sala" e "tirar do palco" são a mesma
 * frase até a última palavra, e uma delas expulsa um adolescente da aula. O
 * palco é o que se usa toda hora; a remoção é o que se usa quase nunca, então
 * ela custa um toque extra de propósito.
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
  const [removeOpen, setRemoveOpen] = useState(false);
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
        ) : removeOpen ? (
          <LiveRoomActionButton
            icon={UserMinus}
            label={t('live.room.action.remove')}
            onClick={() => setConfirmingRemove(true)}
            tone="danger"
            testId="live-room-remove"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            data-testid="live-room-more"
            className="h-8 px-2.5 shrink-0 inline-flex items-center gap-1 rounded-full text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            {t('live.room.action.more')}
          </button>
        )}
      </div>
    </div>
  );
}
