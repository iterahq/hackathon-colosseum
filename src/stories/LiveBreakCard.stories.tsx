import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveBreakCard } from '@/components/live/LiveBreakCard';
import { InstructorBreakToggle } from '@/components/live/InstructorBreakToggle';

/**
 * A pausa para dúvidas, vista dos dois lados: o card que aparece na coluna do
 * aluno e o botão que o professor usa para abri-la e fechá-la.
 *
 * O card fica ACIMA da atividade, não por cima — a pausa é sinalização e não
 * trava nada, então quem já estava respondendo termina.
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

/** O botão do professor, nos dois estados. */
export const ControleDoProfessor: Story = {
  render: () => (
    <div style={{ width: 260, display: 'grid', gap: 12 }}>
      <InstructorBreakToggle onBreak={false} busy={false} onToggle={() => {}} />
      <InstructorBreakToggle onBreak busy={false} onToggle={() => {}} />
    </div>
  ),
};
