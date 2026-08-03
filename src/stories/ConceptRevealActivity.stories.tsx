import type { Meta, StoryObj } from '@storybook/react';
import { ConceptRevealActivity } from '@/components/branded/activity/ConceptRevealActivity';
import { makeActivity, noop } from './activityFixtures';
import { CONCEPT_REVEAL_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { PROPS_CONCEPT } from './richTextFixtures';

/**
 * ConceptReveal — o conceito que termina numa pergunta que o aluno responde na
 * cabeça antes de ver a resposta.
 *
 * Nasceu como marca (`?>`/`?=`) dentro do texto do `concept` e virou kind em
 * 2026-07-31: esconder é comportamento da ATIVIDADE, não de um trecho de texto —
 * e como kind o autor opta explicitamente em vez de esbarrar num delimitador.
 *
 * Quem abre a resposta muda com o contexto: sozinho é o aluno; ao vivo é o
 * professor, pelo "Revelar resposta" (`reveal`).
 *
 * NÃO pontua: revelar é leitura, não submissão. Resposta que vale nota é
 * `single_choice`, `multi_choice` ou `quiz`.
 */
const meta: Meta<typeof ConceptRevealActivity> = {
  title: 'Organisms/Activities/1 · Exposição/ConceptReveal',
  id: 'activities-exposicao-concept-reveal',
  component: ConceptRevealActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ConceptRevealActivity>;

/** Self-paced: a resposta fica atrás de "Ver resposta" até o aluno pedir. */
export const Default: Story = {
  render: () => (
    <ConceptRevealActivity
      activity={makeActivity('concept_reveal', CONCEPT_REVEAL_SPEC)}
      onComplete={noop}
    />
  ),
};

/** Ao vivo, antes do reveal: a pergunta sozinha, e o aluno sem botão nenhum. */
export const AoVivo: Story = {
  render: () => (
    <ConceptRevealActivity
      activity={makeActivity('concept_reveal', CONCEPT_REVEAL_SPEC)}
      onComplete={noop}
      live
    />
  ),
};

/** Ao vivo, depois de o professor clicar em "Revelar resposta". */
export const AoVivoRevelado: Story = {
  render: () => (
    <ConceptRevealActivity
      activity={makeActivity('concept_reveal', CONCEPT_REVEAL_SPEC)}
      onComplete={noop}
      live
      reveal
    />
  ),
};

/** A instrução é um conceito inteiro: o card fecha a tela, não a substitui. */
export const ConceitoInteiro: Story = {
  render: () => (
    <ConceptRevealActivity
      activity={makeActivity('concept_reveal', {
        instruction: { text: PROPS_CONCEPT },
        reveal: {
          prompt: 'Se você trocar `title` dentro do BookCard, a tela atualiza?',
          answer: 'Não. Prop é **somente leitura** — quem troca é quem passou.',
        },
      })}
      onComplete={noop}
    />
  ),
};
