import { Check, X } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * O que o aluno RESPONDEU, no palco.
 *
 * Antes daqui o palco só dizia "respondeu corretamente/incorretamente" — que é
 * exatamente o que o professor já via na sidebar. Puxar alguém pro palco servia
 * para mostrar A RESPOSTA (feedback da aula, 2026-08-02), e ela ficava só no
 * cliente do aluno. O texto vem do `detail.response` que a atividade já entrega.
 *
 * `response` ausente = cliente de um build anterior, ou um kind que não produz
 * texto: cai no veredito sozinho, como era.
 */
export function LiveStageAnswerCard({ correct, response }: { correct: boolean; response?: string }) {
  const { t } = useI18n();
  const tone = correct ? 'text-success' : 'text-destructive';

  return (
    <div
      className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6"
      data-testid="live-stage-summary"
    >
      {response && (
        <>
          <p className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
            {t('live.stage.answer.label')}
          </p>
          <p
            className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line wrap-break-word text-base text-foreground"
            data-testid="live-stage-response"
          >
            {response}
          </p>
        </>
      )}
      <p className={`flex items-center gap-2 text-sm font-medium ${tone} ${response ? 'mt-4' : ''}`}>
        {correct ? (
          <Check className="w-4 h-4 shrink-0" aria-hidden />
        ) : (
          <X className="w-4 h-4 shrink-0" aria-hidden />
        )}
        {t(correct ? 'live.stage.summary.correct' : 'live.stage.summary.wrong')}
      </p>
    </div>
  );
}
