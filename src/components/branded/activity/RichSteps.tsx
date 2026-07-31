/**
 * RichSteps — entrega o conceito em pedaços, no ritmo do aluno.
 *
 * O autor separa os pedaços com `---`. Sem nenhum `---` existe um passo só e
 * este componente some do caminho: a tela fica idêntica ao que era.
 *
 * `stepped` é opt-in, e não opt-out, porque quem NÃO deve dar passo é a maioria:
 * ao vivo a turma precisa olhar a MESMA coisa (se cada aluno revelasse no próprio
 * tempo, metade estaria duas telas atrás do que o professor está explicando), e no
 * enunciado de um quiz esconder metade atrás de um botão com o cronômetro correndo
 * seria pior ainda. Só o conceito self-paced pede o passo.
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { RichBlock } from '@/components/branded/activity/RichBlock';
import { RichReveal } from '@/components/branded/activity/RichReveal';
import { useI18n } from '@/i18n';
import type { StepBlock } from '@/utils/richText';

export function RichSteps({
  steps,
  muted,
  stepped = false,
}: {
  steps: StepBlock[][];
  muted: boolean;
  stepped?: boolean;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(1);
  const reduced = useReducedMotion();
  const shown = stepped ? Math.min(visible, steps.length) : steps.length;
  const remaining = steps.length - shown;
  // O contador sobrevive ao último passo: sumir junto com o botão tirava do
  // aluno justamente o "3 de 3" que fecha a leitura.
  const paced = stepped && steps.length > 1;

  return (
    <div className="space-y-3" data-rich-steps={steps.length} data-rich-steps-shown={shown}>
      {steps.slice(0, shown).map((blocks, stepIndex) => (
        <div key={stepIndex} className="space-y-3" data-rich-step={stepIndex}>
          {blocks.map((block, i) => (
            <motion.div
              key={i}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: reduced ? 0 : Math.min(i, 8) * 0.04 }}
            >
              {block.type === 'reveal' ? (
                <RichReveal prompt={block.prompt} answer={block.answer} stepped={stepped} />
              ) : (
                <RichBlock block={block} muted={muted} />
              )}
            </motion.div>
          ))}
        </div>
      ))}

      {paced && (
        <div className="flex items-center gap-3 pt-1" role="status">
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 1)}
              data-testid="rich-steps-next"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-evergreen px-5 text-sm font-medium text-obsidiana transition-colors hover:bg-evergreen-hi"
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
              {t('activity.steps.next')}
            </button>
          )}
          <span className="text-xs text-muted-foreground" data-testid="rich-steps-progress">
            {t('activity.steps.progress', { shown, total: steps.length })}
          </span>
        </div>
      )}
    </div>
  );
}
