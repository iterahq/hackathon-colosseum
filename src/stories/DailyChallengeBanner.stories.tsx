import type { Meta, StoryObj } from '@storybook/react-vite';
import { DailyChallengeBanner } from '@/components/data-layer/DailyChallengeBanner';
import { challenge } from './dataLayerFixtures';

const meta: Meta<typeof DailyChallengeBanner> = {
  title: 'DataLayer/DailyChallengeBanner',
  component: DailyChallengeBanner,
  parameters: { layout: 'padded' },
  render: (args) => (
    <div style={{ maxWidth: 900 }}>
      <DailyChallengeBanner {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof DailyChallengeBanner>;

// O componente compara `expiresAt` com o dia de hoje. Calcular a data na story é
// justamente o que mantém o texto estável: esse ramo não interpola data nenhuma.
export const ExpiresToday: Story = {
  args: { challenge: { ...challenge, expiresAt: new Date().toISOString() } },
};

export const ExpiresLater: Story = {
  args: { challenge: { ...challenge, expiresAt: '2026-12-31T23:59:00.000Z' } },
};

export const HighBonus: Story = {
  args: { challenge: { ...challenge, expiresAt: '2026-12-31T23:59:00.000Z', bonusXp: 1200 } },
};

export const LongDescription: Story = {
  args: {
    challenge: {
      ...challenge,
      expiresAt: '2026-12-31T23:59:00.000Z',
      title: 'Complete o módulo de componentes e ainda revise a lição de estado',
      description:
        'Termine todas as atividades do módulo de componentes, revise a lição de estado e responda ao quiz final antes da meia-noite para levar o bônus completo.',
    },
  },
};
