import type { Meta, StoryObj } from '@storybook/react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity, noop } from './activityFixtures';
import { DOCUMENT_READING_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `document` — MODO LEITURA.
 *
 *   { title? , body }  ·  SEM `prompt` e SEM `rubric`
 *
 * A metadata é o que separa os dois modos de `document`: o renderer só entra no
 * caminho de leitura pura (texto + "marcar como concluída", sem campo de
 * escrita) quando NÃO há `spec.prompt` e NÃO há `rubric.min_words`. Basta a
 * autoria mandar um `prompt` e a MESMA activity vira redação — por isso o modo
 * de redação está em `5 · Produção/Document (redação)`, como contrato próprio.
 *
 * `document` ainda é stub LOOSE no `@iterahq/activity-spec`
 * (`z.record(z.unknown())`): os fixtures abaixo foram montados a partir do que o
 * `DocumentActivity` de fato LÊ (`prompt` → `title` → fallback i18n, e `body`).
 *
 * `DocumentActivity` não é exportado — a story renderiza o dispatcher REAL
 * (`ActivityRenderer`) com `kind: 'document'`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/1 · Exposição/Document (leitura)',
  id: 'activities-exposicao-document-leitura',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/** `title` + `body` → leitura pura; concluir é o único gesto disponível. */
export const Leitura: Story = {
  args: { activity: makeActivity('document', DOCUMENT_READING_SPEC) },
};

/** Variação: sem `title` → o renderer cai no rótulo i18n do kind. */
export const SemTitulo: Story = {
  args: {
    activity: makeActivity('document', {
      body: 'Anotar à mão ajuda a lembrar mais do que só reler. Experimente resumir cada aula em três linhas.',
    }),
  },
};

/** Variação de ESTADO: activity concluída → botão travado em "Concluída". */
export const Concluida: Story = {
  args: { activity: makeActivity('document', DOCUMENT_READING_SPEC, 'done') },
};
