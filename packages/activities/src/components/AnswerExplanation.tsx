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
 * No Itera Player elas CHEGAM aqui como string, porque `programs.service.mapActivity`
 * (e os outros dois mappers) já passaram o spec por `resolveLocalizedSpec`. Este
 * componente resolve de novo por DEFESA: se um host montar o renderer com o spec
 * cru — e o `ActivityTestHarness` do autor e as stories fazem exatamente isso —
 * o modo de falha antigo era o pior possível, um painel EM BRANCO. O autor
 * escreveu o porquê e o aluno não via nada, sem erro, sem log, sem sintoma.
 *
 * 📦 E fora do Player esse "por defesa" deixa de ser defesa e vira o caminho
 * normal: um consumidor externo NÃO tem os mappers do Itera, então o spec que
 * ele passa é sempre o cru. Extrair o componente sem trazer esta resolução
 * junto teria reintroduzido o painel em branco para todo host novo — no exato
 * dia em que a correção foi mergeada (#309).
 *
 * `resolveLocalizedText` é a MESMA resolução do `resolveLocalizedSpec`, não uma
 * segunda implementação: bag → locale ativo → `pt` → `en`. Ela mora aqui e o
 * `@/utils/resolveLocalizedSpec` do app RE-EXPORTA — porque duas ordens de
 * fallback que discordam é como um leitor EN acaba vendo frases diferentes
 * dependendo de qual componente renderizou.
 */
import type { Locale } from '@iterahq/activity-spec/runtime';
import { useActivityI18n, useActivitySound } from '../context.js';
import { parseInline } from '../internal/richText.js';
import { resolveLocalizedText } from '../internal/localizedText.js';
import { ExplanationDisclosure } from './ExplanationDisclosure.js';
import { RichSpans } from './RichSpans.js';
import { TeraAvatar } from './TeraAvatar.js';
import { useHostExplainsMisses } from './explainedMiss.js';

/**
 * The authored "porquê" as text for a MISS, or `undefined` when there is none or
 * the answer was right. The kinds hand it up in `onComplete`, so a host with a
 * feedback footer shows it THERE; this component then stays out of the way.
 */
export function answerExplanationText(
  spec: Record<string, unknown> | undefined,
  locale: Locale,
  correct: boolean,
): string | undefined {
  if (correct) return undefined;
  const text = (resolveLocalizedText(spec?.explanation, locale) ?? '').trim();
  return text === '' ? undefined : text;
}

export function AnswerExplanation({
  spec,
  shown,
  correct,
  handedUp = false,
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
  /**
   * The learner just submitted in THIS session, so the kind already handed the
   * explanation up through `onComplete`. A host inside `HostExplainsMisses`
   * shows it in its own feedback footer and the box stays out; on a review
   * (re-opened activity, no footer) it is `false` and the box shows.
   */
  handedUp?: boolean;
}) {
  const { t, locale } = useActivityI18n();
  const explainsMisses = useHostExplainsMisses();
  const playSound = useActivitySound();
  const text = (resolveLocalizedText(spec?.explanation, locale) ?? '').trim();
  if (!shown || correct === true || text === '' || (handedUp && explainsMisses)) return null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-1" data-testid="answer-explanation">
      <ExplanationDisclosure
        label={t('activity.explanationTitle')}
        buttonClassName="text-menta"
        contentTestId="answer-explanation-text"
        onToggle={(open) => {
          if (open) playSound('pick');
        }}
      >
        <div className="flex items-start gap-3 pb-3 pt-1">
          <TeraAvatar mood={correct === false ? 'oops' : 'neutral'} size="sm" idle={false} className="-mt-1" />
          <p className="min-w-0 whitespace-pre-wrap text-sm text-foreground/80">
            <RichSpans spans={parseInline(text)} />
          </p>
        </div>
      </ExplanationDisclosure>
    </div>
  );
}
