/**
 * ConceptReveal — o conceito que termina numa pergunta que o aluno responde na
 * cabeça antes de ver a resposta.
 *
 * Nasceu como marca (`?>`/`?=`) dentro do texto do `concept` e virou kind em
 * 2026-07-31: ao vivo quem dita o ritmo é o professor falando, então a resposta
 * aparece aberta — esconder é comportamento da ATIVIDADE, não de um trecho de
 * texto. Como kind, o autor também opta explicitamente em vez de esbarrar num
 * delimitador.
 *
 * NÃO pontua nem chama `onComplete`: ao vivo o `learnerActivityGate` trava em
 * `answered → readOnly` e o pódio ranqueia por acerto, então pensar alto no meio
 * da explicação viraria nota permanente.
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HelpCircle, Lightbulb } from 'lucide-react';
import { RichText } from '@/components/branded/activity/RichText';
import { useI18n } from '@/i18n';
import type { Activity, ConceptRevealSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell } from './parts';

export function ConceptRevealActivity({
  activity,
  live = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  live?: boolean;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const spec = activity.spec as unknown as ConceptRevealSpec;
  const shown = opened || live;
  const answerId = `concept-reveal-answer-${activity.id}`;

  return (
    <ActivityShell kind="concept_reveal" icon={Lightbulb} label={t('activity.conceptReveal')}>
      <InstructionPanel spec={spec?.instruction} />

      <div
        className="rounded-2xl border border-evergreen/30 bg-evergreen-soft/20 p-4"
        data-testid="concept-reveal-card"
        data-revealed={shown ? 'true' : 'false'}
      >
        <div className="flex items-start gap-2.5">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-hi" aria-hidden="true" />
          <RichText text={spec?.reveal?.prompt ?? ''} data-testid="concept-reveal-prompt" />
        </div>

        {/* O botão continua montado depois de revelar (vira "esconder") porque
            desmontá-lo jogava o foco no <body> e o leitor de tela não anunciava
            nada: com ele vivo, o `aria-expanded` é o próprio anúncio. */}
        {!live && (
          <button
            type="button"
            onClick={() => setOpened((v) => !v)}
            aria-expanded={shown}
            aria-controls={answerId}
            data-testid="concept-reveal-show"
            className="mt-3 inline-flex h-9 items-center rounded-full border border-evergreen/40 px-4 text-sm text-evergreen-hi transition-colors hover:bg-evergreen-soft/40"
          >
            {t(shown ? 'activity.reveal.hide' : 'activity.reveal.show')}
          </button>
        )}

        {/* A região existe sempre; região viva injetada junto com o conteúdo é
            anunciada de forma não confiável. */}
        <div id={answerId} aria-live="polite">
          {shown && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 border-t border-evergreen/20 pt-3"
            >
              <RichText text={spec?.reveal?.answer ?? ''} data-testid="concept-reveal-answer" />
            </motion.div>
          )}
        </div>
      </div>
    </ActivityShell>
  );
}
