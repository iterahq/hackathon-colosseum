import { MousePointer2 } from 'lucide-react';
import { ChatScreenMirror, TerminalScreenMirror } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { CodeLivePreview } from '@/components/branded/activity/code/CodeLivePreview';
import { WithoutTextDrafts } from '@/components/branded/activity/IteraActivityHost';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { LiveStageAnswerCard } from '@/components/live/LiveStageAnswerCard';
import { StageCursorOverlay } from '@/components/live/StageCursorOverlay';
import { WIDE_COLUMN_MAX_WIDTH } from '@/utils/activityColumnWidth';
import {
  CODE_PANE_BOX,
  CODE_SPLIT_EDITOR,
  CODE_SPLIT_GRID,
  CODE_SPLIT_PREVIEW,
} from '@/utils/codeStageGeometry';
import type { Activity } from '@/types/content';
import type { StageCursor, StagedAnswer } from '@/types/liveClass';

interface LiveStageBodyProps {
  staged: StagedAnswer;
  /** Espelho read-only da atividade atual; `null` quando não há o que espelhar. */
  mirrorActivity: Activity | null;
  cursor: StageCursor | null;
  cursorIntervalMs: number;
  cursorOff: boolean;
}

/**
 * O conteúdo projetado no palco.
 *
 * Numa atividade de resposta o palco mostra a PERGUNTA (espelho da atividade) e
 * embaixo A RESPOSTA do aluno — nessa ordem, porque o professor puxa alguém pra
 * discutir a resposta com a turma, e sem o enunciado ao lado ninguém acompanha.
 *
 * `code`, `terminal` e `chat` são as exceções, pela MESMA razão: neles a tela do
 * aluno já é a resposta, e remontar a atividade ao lado semearia estado do
 * espectador (ver `LiveStage.mirrorsFromViewerState`). O enunciado não some por
 * isso — ele viaja dentro da tela espelhada, escrito pelo cliente do aluno.
 */
export function LiveStageBody({
  staged,
  mirrorActivity,
  cursor,
  cursorIntervalMs,
  cursorOff,
}: LiveStageBodyProps) {
  const { t } = useI18n();
  const answered = staged.kind === 'answer' && staged.status !== 'not_started';

  // O TERMINAL do aluno, REDESENHADO — não remontado. Quem desenha é o
  // `TerminalScreenMirror` do `@iterahq/activities`, o mesmo componente que
  // compõe a janela do aluno, para que as duas imagens batam por construção.
  // Ele não tem reducer e não tem engine: não consegue inventar uma linha.
  if (staged.kind === 'terminal' && staged.terminal) {
    return (
      <div className={`mx-auto w-full ${WIDE_COLUMN_MAX_WIDTH}`} data-testid="live-stage-terminal">
        <TerminalScreenMirror screen={staged.terminal} />
      </div>
    );
  }

  // O CHAT do aluno, REDESENHADO — mesma regra, mesmo componente compartilhado
  // com a janela dele (`ChatScreenMirror` reusa `SandboxWindow`/`SandboxChatLog`
  // /`CHAT_SCROLL`). Sem reducer e sem runtime: não consegue inventar um turno.
  //
  // ⚠️ Só os turnos ENVIADOS chegam aqui. O compositor do aluno — onde mora o
  // rascunho ainda não enviado — não atravessa a rede; ver `ActivityChatScreen`.
  if (staged.kind === 'chat' && staged.chat) {
    return (
      <div className={`mx-auto w-full ${WIDE_COLUMN_MAX_WIDTH}`} data-testid="live-stage-chat">
        <ChatScreenMirror screen={staged.chat} />
      </div>
    );
  }

  // Sem filtro por `status`: um `code` só chega aqui quando há fonte pra
  // projetar, e `not_started` num code quer dizer "o aluno ainda não digitou" —
  // não "não há nada na tela dele". Esse filtro era a segunda metade do P1: o
  // aluno passou a responder com o starter e a turma via o placeholder igual.
  if (staged.kind === 'code') {
    // O cap vem da regra COMPARTILHADA de largura de `code`, não de um
    // `max-w-4xl` local: (a) aquele cap re-estreitava o palco justamente no kind
    // que o módulo existe pra alargar, e (b) na tela do aluno esta faixa é irmã
    // da coluna (full-bleed), então sem cap ela abriria muito mais que o painel
    // do emissor — e a largura entra na normalização do cursor.
    return (
      <div className={`mx-auto w-full ${WIDE_COLUMN_MAX_WIDTH}`}>
        <div className={CODE_SPLIT_GRID}>
          {/* `relative` + o marcador são a metade-espelho do contrato de cursor:
              o MESMO painel (tokens de `codeStageGeometry`) contra o qual o
              emissor normaliza, para que 0..1 volte ao mesmo ponto em qualquer
              tela. O preview ao lado é um iframe sandbox cross-origin e
              deliberadamente NÃO é espelhado — eventos de ponteiro nunca saem
              dele (ADR-8), então um cursor ali seria inventado. */}
          <div className={CODE_SPLIT_EDITOR}>
            <div
              data-stage-cursor-mirror
              className={`relative ${CODE_PANE_BOX} border border-border bg-[#0a0a0a]`}
            >
              <CodeEditor
                value={staged.content}
                language="typescript"
                readOnly
                remoteCaret={cursor?.caret ?? null}
              />
              <StageCursorOverlay
                cursor={cursor}
                authorName={staged.author.name}
                intervalMs={cursorIntervalMs}
              />
            </div>
          </div>
          <div className={`${CODE_SPLIT_PREVIEW} ${CODE_PANE_BOX} border border-border`}>
            <CodeLivePreview code={staged.content} />
          </div>
        </div>
        {cursorOff && (
          <p
            data-testid="live-stage-cursor-off"
            className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
          >
            <MousePointer2 className="w-3.5 h-3.5" /> {t('live.stage.cursorOff')}
          </p>
        )}
      </div>
    );
  }

  if (!mirrorActivity && !answered) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-3xl border border-dashed border-border bg-card p-6 text-center"
        data-testid="live-stage-empty"
      >
        <p className="text-sm text-muted-foreground">{t('live.stage.empty')}</p>
      </div>
    );
  }

  return (
    <>
      {mirrorActivity && (
        <WithoutTextDrafts>
          <LiveActivityStage activity={mirrorActivity} readOnly testid="live-stage-activity" />
        </WithoutTextDrafts>
      )}
      {answered && (
        <div className={mirrorActivity ? 'mt-6' : undefined}>
          <LiveStageAnswerCard correct={staged.content === 'correct'} response={staged.response} />
        </div>
      )}
    </>
  );
}
