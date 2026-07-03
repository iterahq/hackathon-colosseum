import type { Meta, StoryObj } from '@storybook/react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity, noop, SAMPLE_IMAGE, SAMPLE_VIDEO } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * ActivityRenderer — the dispatch organism that routes an `Activity` row to the
 * correct view by `kind`. This story exercises one representative scenario per
 * activity kind so you can see the full catalogue in one place.
 *
 * ActivityRenderer already exists in the codebase — this story reuses it rather
 * than duplicating rendering logic. The individual kind stories
 * (Organisms/Activities/*) exist for exhaustive variant coverage.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/ActivityRenderer',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/** kind = concept — display-only, no interaction. */
export const Concept: Story = {
  args: {
    activity: makeActivity('concept', {
      instruction: { text: 'Um modelo de dados descreve como as entidades se relacionam.', image_url: SAMPLE_IMAGE },
    }),
  },
};

/** kind = video — watch-only; DoneButton unlocks completion. */
export const Video: Story = {
  args: {
    activity: makeActivity('video', {
      video_url: SAMPLE_VIDEO,
      instruction: { text: 'Assista à introdução ao modelo relacional.' },
    }),
  },
};

/** kind = single_choice — pick exactly one correct answer. */
export const SingleChoice: Story = {
  args: {
    activity: makeActivity('single_choice', {
      instruction: { text: 'Qual estrutura evita duplicar dados entre tabelas?' },
      options: [
        { id: 'a', label: 'Copiar as colunas para cada tabela' },
        { id: 'b', label: 'Usar uma chave estrangeira (FK)' },
        { id: 'c', label: 'Duplicar a tabela inteira' },
      ],
      correct_option_id: 'b',
    }),
  },
};

/** kind = multi_choice — pick all that apply. */
export const MultiChoice: Story = {
  args: {
    activity: makeActivity('multi_choice', {
      instruction: { text: 'Quais são boas práticas de modelagem relacional?' },
      options: [
        { id: 'a', label: 'Normalizar para evitar redundância' },
        { id: 'b', label: 'Usar chaves estrangeiras para relações' },
        { id: 'c', label: 'Copiar dados entre todas as tabelas' },
        { id: 'd', label: 'Definir chaves primárias' },
      ],
      correct_option_ids: ['a', 'b', 'd'],
    }),
  },
};

/** kind = match — connect left items to right items. */
export const Match: Story = {
  args: {
    activity: makeActivity('match', {
      instruction: { text: 'Associe cada termo à sua definição.' },
      left: [
        { id: 'pk', label: 'Chave primária' },
        { id: 'fk', label: 'Chave estrangeira' },
        { id: 'idx', label: 'Índice' },
      ],
      right: [
        { id: 'r-idx', label: 'Acelera buscas por coluna' },
        { id: 'r-pk', label: 'Identifica unicamente uma linha' },
        { id: 'r-fk', label: 'Referencia a PK de outra tabela' },
      ],
      pairs: [
        { left_id: 'pk', right_id: 'r-pk' },
        { left_id: 'fk', right_id: 'r-fk' },
        { left_id: 'idx', right_id: 'r-idx' },
      ],
    }),
  },
};

/** kind = order — drag-to-reorder a scrambled sequence. */
export const Order: Story = {
  args: {
    activity: makeActivity('order', {
      instruction: { text: 'Ordene as etapas de modelagem de dados.' },
      items: [
        { id: 's3', label: '3. Normalizar as tabelas' },
        { id: 's1', label: '1. Identificar as entidades' },
        { id: 's4', label: '4. Definir chaves e relações' },
        { id: 's2', label: '2. Listar os atributos' },
      ],
      correct_order: ['s1', 's2', 's3', 's4'],
    }),
  },
};
