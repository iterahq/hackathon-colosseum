import type { Meta, StoryObj } from '@storybook/react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity, noop } from './activityFixtures';
import { DIAGRAM_FLOWCHART_SPEC, DIAGRAM_MERMAID_SPEC, SAMPLE_IMAGE } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `diagram` — exposição de um diagrama para leitura.
 *
 *   { prompt, mermaid? , imageUrl? }
 *
 * É um contrato à parte do `concept` porque a autoria entrega uma FONTE DE
 * DIAGRAMA (`mermaid` como texto ou `imageUrl`), não um InstructionPanel: o
 * renderer usa uma moldura própria (fundo com grid, mono verde) e prioriza
 * `imageUrl` sobre `mermaid`. Ter imagem OU mermaid é variação do mesmo
 * contrato — por isso são variantes desta story, não activities diferentes.
 *
 * `diagram` ainda é stub LOOSE no `@iterahq/activity-spec`
 * (`z.record(z.unknown())`), então o Zod aceita qualquer objeto: os fixtures
 * abaixo foram montados a partir do que o `DiagramActivity` de fato LÊ.
 *
 * `DiagramActivity` não é exportado — a story renderiza o dispatcher REAL
 * (`ActivityRenderer`) com `kind: 'diagram'`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/1 · Exposição/Diagram',
  id: 'activities-exposicao-diagram',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/**
 * `mermaid` FORA do subconjunto (`erDiagram`) → o texto do diagrama continua
 * exibido em mono verde dentro da moldura, exatamente como antes do renderer.
 *
 * Esta é a story do CHÃO: nenhuma linha que já existe no banco pode piorar
 * porque o desenho entrou. Quem escreve dentro do subconjunto ganha o SVG
 * (`Fluxograma`, abaixo); quem não escreve fica onde estava.
 */
export const Mermaid: Story = {
  args: { activity: makeActivity('diagram', DIAGRAM_MERMAID_SPEC) },
};

/**
 * `mermaid` DENTRO do subconjunto → SVG desenhado pelo `MermaidLite`, e os chips
 * de highlight viram BOTÃO ligado ao nó de mesmo rótulo.
 *
 * Clicar (ou dar Tab até) um chip acende o nó, e vice-versa. É o modo em que o
 * professor dá a aula ao vivo: ele aponta pelo chip e a turma vê no desenho,
 * inclusive quem está no celular e não enxerga o dedo dele no projetor.
 */
export const Fluxograma: Story = {
  args: { activity: makeActivity('diagram', DIAGRAM_FLOWCHART_SPEC) },
};

/** Variação de layout: `graph LR` desenha em camadas da esquerda para a direita. */
export const FluxogramaHorizontal: Story = {
  args: {
    activity: makeActivity('diagram', {
      prompt: 'A linha do tempo de commits: cada ponto é uma foto do projeto.',
      mermaid: [
        'flowchart LR',
        '  A[commit 1] --> B[commit 2]',
        '  B -->|git commit| C[commit 3]',
        '  C --> D(HEAD)',
      ].join('\n'),
      highlights: [{ term: 'HEAD', caption: 'onde você está agora' }],
    }),
  },
};

/**
 * DEGRADAÇÃO: o desenho sai, mas NENHUM `term` casa com rótulo de nó.
 *
 * Os chips voltam a ser exatamente o que sempre foram — `<div>` que pulsa, sem
 * foco e sem `aria-pressed` prometendo uma interação que não existe.
 */
export const FluxogramaSemDestaqueCasado: Story = {
  args: {
    activity: makeActivity('diagram', {
      ...DIAGRAM_FLOWCHART_SPEC,
      highlights: [
        { term: 'for', caption: 'o jeito antigo: você mesmo cuida do índice' },
        { term: 'imutabilidade', caption: 'a lista de entrada nunca é alterada' },
      ],
    }),
  },
};

/** Variação: `imageUrl` tem prioridade sobre `mermaid` quando os dois existem. */
export const Imagem: Story = {
  args: {
    activity: makeActivity('diagram', {
      prompt: 'Observe o fluxo de uma reserva de livro na biblioteca.',
      imageUrl: SAMPLE_IMAGE,
    }),
  },
};

/** Variação: só `prompt` → fallback com ícone, sem fonte de diagrama. */
export const SomentePrompt: Story = {
  args: {
    activity: makeActivity('diagram', {
      prompt: 'O diagrama desta aula ainda não foi anexado pela autoria.',
    }),
  },
};

/** Variação de ESTADO: activity concluída → botão travado em "Concluída". */
export const Concluida: Story = {
  args: { activity: makeActivity('diagram', DIAGRAM_MERMAID_SPEC, 'done') },
};
