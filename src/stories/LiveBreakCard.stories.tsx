import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveBreakCard } from '@/components/live/LiveBreakCard';
import { InstructorOverflowMenu } from '@/components/live/InstructorOverflowMenu';

/**
 * A pausa para dúvidas, vista dos dois lados: o card que aparece na coluna do
 * aluno e o menu onde o professor a abre e fecha.
 *
 * O card fica ACIMA da atividade, não por cima — a pausa é sinalização e não
 * trava nada, então quem já estava respondendo termina.
 *
 * Do lado do professor a ação mora atrás do kebab: a barra lateral não tem
 * orçamento vertical para um botão de largura cheia que se usa uma vez por aula.
 */
const meta: Meta<typeof LiveBreakCard> = {
  title: 'Molecules/Live/LiveBreakCard',
  component: LiveBreakCard,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveBreakCard>;

/** O que o aluno vê enquanto a turma está tirando dúvidas. */
export const Aluno: Story = {
  render: () => (
    <div style={{ width: 560 }}>
      <LiveBreakCard />
    </div>
  ),
};

/** O kebab do professor, nos dois estados — tingido enquanto a pausa está aberta. */
export const ControleDoProfessor: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <InstructorOverflowMenu
        busy={false}
        onBreak={false}
        onToggleBreak={() => {}}
        onResetLesson={() => {}}
      />
      <InstructorOverflowMenu busy={false} onBreak onToggleBreak={() => {}} onResetLesson={() => {}} />
    </div>
  ),
};
