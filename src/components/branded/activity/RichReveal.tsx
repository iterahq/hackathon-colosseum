/**
 * RichReveal — a pergunta que o aluno responde na cabeça antes de ver a resposta.
 *
 * Existe porque conceito é tela de leitura: sem nada pra fazer, o olho desliza.
 * Um segundo de "peraí, qual é?" antes da resposta é o que fixa. E é de propósito
 * que NÃO pontua nem chama `onComplete`: ao vivo o `learnerActivityGate` trava em
 * `answered → readOnly` e o pódio ranqueia por acerto, então uma pergunta no meio
 * da explicação viraria nota permanente por ter pensado alto.
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { RichSpans } from '@/components/branded/activity/RichSpans';
import { useI18n } from '@/i18n';
import type { Inline } from '@/utils/richTextInline';

export function RichReveal({
  prompt,
  answer,
  stepped = false,
}: {
  prompt: Inline[];
  answer: Inline[];
  stepped?: boolean;
}) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const reduced = useReducedMotion();
  const shown = opened || !stepped;
  // Sem enunciado não há o que pensar antes: `?=` órfão vira texto normal, e não
  // um card com um botão "Ver resposta" pairando sobre um vazio.
  if (prompt.length === 0)
    return (
      <p
        className="whitespace-pre-line font-display text-lg md:text-xl text-foreground leading-relaxed"
        data-rich-block="paragraph"
      >
        <RichSpans spans={answer} />
      </p>
    );

  const hasAnswer = answer.length > 0;

  return (
    <div
      className="rounded-2xl border border-evergreen/30 bg-evergreen-soft/20 p-4"
      data-rich-block="reveal"
      data-revealed={shown ? 'true' : 'false'}
    >
      <div className="flex items-start gap-2.5">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-hi" aria-hidden="true" />
        <p className="whitespace-pre-line font-display text-lg text-foreground leading-relaxed">
          <RichSpans spans={prompt} />
        </p>
      </div>

      {hasAnswer && !shown && (
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-expanded={false}
          data-testid="rich-reveal-show"
          className="mt-3 inline-flex h-9 items-center rounded-full border border-evergreen/40 px-4 text-sm text-evergreen-hi transition-colors hover:bg-evergreen-soft/40"
        >
          {t('activity.reveal.show')}
        </button>
      )}

      {hasAnswer && shown && (
        <motion.p
          initial={reduced ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          data-testid="rich-reveal-answer"
          className="mt-3 whitespace-pre-line border-t border-evergreen/20 pt-3 text-base text-foreground leading-relaxed"
        >
          <RichSpans spans={answer} />
        </motion.p>
      )}
    </div>
  );
}
