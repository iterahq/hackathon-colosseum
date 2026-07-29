/**
 * O "porquê" autorado, mostrado só quando o aluno NÃO acertou — errar era um
 * beco sem saída (estado vermelho e mais nada), que é exatamente onde o
 * iniciante desiste.
 *
 * Lê `spec.explanation` do spec cru: hoje só o contrato do `quiz` declara esse
 * campo, então as outras kinds não renderizam nada até o spec delas carregar um
 * — explicação ausente nunca deve virar texto genérico de enchimento.
 */
import { Lightbulb } from 'lucide-react';
import { useI18n } from '@/i18n';

export function AnswerExplanation({
  spec,
  shown,
  correct,
}: {
  spec: Record<string, unknown> | undefined;
  /** `shown` do answerMachine: o gabarito já está na tela. */
  shown: boolean;
  /**
   * `gradeResult` do answerMachine — `undefined` quando o gabarito apareceu sem
   * submissão (revelar do professor). Só o acerto EFETIVO esconde o porquê: num
   * revelar, quem não enviou nada é justamente quem mais precisa lê-lo.
   */
  correct: boolean | undefined;
}) {
  const { t } = useI18n();
  const raw = spec?.explanation;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!shown || correct === true || text === '') return null;

  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
      data-testid="answer-explanation"
    >
      <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-menta" />
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-wider text-menta">
          {t('activity.explanationTitle')}
        </p>
        <p className="mt-1 text-sm text-foreground/80">{text}</p>
      </div>
    </div>
  );
}
