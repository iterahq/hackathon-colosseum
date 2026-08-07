/**
 * O "porquê" autorado, mostrado só quando o aluno NÃO acertou — errar era um
 * beco sem saída (estado vermelho e mais nada), que é exatamente onde o
 * iniciante desiste.
 *
 * Lê `spec.explanation` do spec cru: hoje só o contrato do `quiz` declara esse
 * campo, então as outras kinds não renderizam nada até o spec delas carregar um
 * — explicação ausente nunca deve virar texto genérico de enchimento.
 *
 * ⚠️ AS DUAS FORMAS SÃO LEGÍTIMAS. `@iterahq/activity-spec` declara
 * `explanation` como `LocalizedTextSchema.optional()` em `quiz` /
 * `single_choice` / `multi_choice`, ou seja: `string` OU bag `{ pt, en }`. E o
 * banco só tem a segunda — as 41 linhas de produção que carregam
 * `spec.explanation` hoje (quiz 34, single_choice 5, multi_choice 2) são
 * 41/41 bags bilíngues, zero strings puras.
 *
 * Na prática elas CHEGAM aqui como string, porque `programs.service.mapActivity`
 * (e os outros dois mappers) já passaram o spec por `resolveLocalizedSpec`. Este
 * componente resolve de novo por DEFESA: se um host montar o renderer com o spec
 * cru — e o `ActivityTestHarness` do autor e as stories fazem exatamente isso —
 * o modo de falha antigo era o pior possível, um painel EM BRANCO. O autor
 * escreveu o porquê e o aluno não via nada, sem erro, sem log, sem sintoma.
 * `resolveLocalizedText` é a MESMA resolução do `resolveLocalizedSpec`, não uma
 * segunda implementação: bag → locale ativo → `pt` → `en`.
 */
import { Lightbulb } from 'lucide-react';
import { useI18n } from '@/i18n';
import { parseInline } from '@/utils/richText';
import { resolveLocalizedText } from '@/utils/resolveLocalizedSpec';
import { RichSpans } from './RichSpans';

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
  const { t, locale } = useI18n();
  const text = (resolveLocalizedText(spec?.explanation, locale) ?? '').trim();
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
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
          <RichSpans spans={parseInline(text)} />
        </p>
      </div>
    </div>
  );
}
