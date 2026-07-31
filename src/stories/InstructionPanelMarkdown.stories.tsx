import type { Meta, StoryObj } from '@storybook/react';
import { InstructionPanel } from '@/components/branded/activity/InstructionPanel';
import { FLAT_GIT, PROPS_CONCEPT, VOCABULARY } from '@/stories/richTextFixtures';

/**
 * O markdown-leve que os autores JÁ escrevem, renderizado. Antes a instrução era
 * um `<p>` corrido e o aluno lia os asteriscos e as crases na tela.
 *
 * A tela sai INTEIRA: a paginação por `---` ("continuar lendo") foi aposentada
 * em 2026-07-31 — era clique sem informação em troca. Pergunta com resposta
 * escondida agora é o kind `concept_reveal`, não marcação dentro do texto.
 */
const meta: Meta<typeof InstructionPanel> = {
  title: 'Molecules/InstructionPanel/Markdown',
  component: InstructionPanel,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof InstructionPanel>;

const wrap = { maxWidth: 560 } as const;

/** O texto real da aula de Git do Educar+, do jeito que está no banco. */
export const AulaReal: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: FLAT_GIT }} />
    </div>
  ),
};

/** Blocos cercados no meio da explicação — o caso mais comum nas aulas de React. */
export const ComCodigo: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: PROPS_CONCEPT }} />
    </div>
  ),
};

/** Todos os blocos que o parser conhece, num texto só. */
export const Vocabulario: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: VOCABULARY }} />
    </div>
  ),
};

/** A descrição é secundária: mesmo parser, voz apagada. */
export const ComDescricao: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel
        spec={{ text: PROPS_CONCEPT, description: 'Depois disto vem o exercício de props.' }}
      />
    </div>
  ),
};

/** Sem marcação nenhuma o texto sai como sempre saiu — um parágrafo só. */
export const SemMarcacao: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: 'Crie um componente BookCard que receba o título.' }} />
    </div>
  ),
};
