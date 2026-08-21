import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserProfileCard } from '@/components/data-layer/UserProfileCard';
import { profile } from './dataLayerFixtures';

const meta: Meta<typeof UserProfileCard> = {
  title: 'DataLayer/UserProfileCard',
  component: UserProfileCard,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 380 }}>
      <UserProfileCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof UserProfileCard>;

export const Default: Story = { args: { profile } };

export const Compact: Story = { args: { profile, variant: 'compact' } };

export const LongName: Story = {
  args: {
    profile: {
      ...profile,
      name: 'Maria Fernanda de Albuquerque Cavalcanti',
      email: 'maria.fernanda.albuquerque.cavalcanti@exemplo-muito-longo.com.br',
    },
  },
};

// Avatar quebrado é o estado que o aluno vê quando o storage não responde.
export const BrokenAvatar: Story = {
  args: { profile: { ...profile, avatarUrl: '/nao-existe.png' } },
};
