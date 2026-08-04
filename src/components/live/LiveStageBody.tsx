import { MousePointer2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { CodeLivePreview } from '@/components/branded/activity/code/CodeLivePreview';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { LiveStageAnswerCard } from '@/components/live/LiveStageAnswerCard';
import { StageCursorOverlay } from '@/components/live/StageCursorOverlay';
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
 * `code` é a exceção: o próprio editor já é a resposta.
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

  if (staged.kind === 'code' && staged.status !== 'not_started') {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* `relative` + o marcador são a metade-espelho do contrato de cursor:
              o mesmo painel de 360px contra o qual o emissor normaliza, para que
              0..1 volte ao mesmo ponto em qualquer tela. O preview ao lado é um
              iframe sandbox cross-origin e deliberadamente NÃO é espelhado —
              eventos de ponteiro nunca saem dele (ADR-8), então um cursor ali
              seria inventado. */}
          <div
            data-stage-cursor-mirror
            className="relative h-[360px] overflow-hidden rounded-2xl border border-border bg-[#0a0a0a]"
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
          <div className="h-[360px] overflow-hidden rounded-2xl border border-border">
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
        <LiveActivityStage activity={mirrorActivity} readOnly testid="live-stage-activity" />
      )}
      {answered && (
        <div className={mirrorActivity ? 'mt-6' : undefined}>
          <LiveStageAnswerCard correct={staged.content === 'correct'} response={staged.response} />
        </div>
      )}
    </>
  );
}
