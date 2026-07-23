import type { Meta, StoryObj } from '@storybook/react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity, noop } from './activityFixtures';
import { DIAGRAM_MERMAID_SPEC, SAMPLE_IMAGE } from './contractFixtures';
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

/** `mermaid` → o texto do diagrama é exibido em mono verde dentro da moldura. */
export const Mermaid: Story = {
  args: { activity: makeActivity('diagram', DIAGRAM_MERMAID_SPEC) },
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
