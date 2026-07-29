import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActivitySkeleton } from '@/components/branded/activity/ActivitySkeleton';

/**
 * ActivitySkeleton — o placeholder da atividade enquanto ela carrega. Existe
 * story porque o bug original era invisível: a classe `ds-shimmer` não tinha
 * CSS nenhum, então o "skeleton" era espaço em branco e nada acusava.
 */
const meta: Meta<typeof ActivitySkeleton> = {
  title: 'Atoms/Activity/ActivitySkeleton',
  component: ActivitySkeleton,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ActivitySkeleton>;

export const Default: Story = {};

/** Na largura real da coluna de atividade da aula ao vivo. */
export const NaColunaDaAula: Story = {
  render: () => (
    <div className="max-w-3xl mx-auto">
      <ActivitySkeleton />
    </div>
  ),
};
