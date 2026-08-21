import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnnouncementList } from '@/components/data-layer/AnnouncementList';
import { announcements } from './dataLayerFixtures';

const meta: Meta<typeof AnnouncementList> = {
  title: 'DataLayer/AnnouncementList',
  component: AnnouncementList,
  render: (args) => (
    <div style={{ maxWidth: 560 }}>
      <AnnouncementList {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof AnnouncementList>;

export const AllSeverities: Story = { args: { announcements } };

export const OnlyInfo: Story = {
  args: { announcements: announcements.filter((a) => a.severity === 'info') },
};

export const OnlyWarning: Story = {
  args: { announcements: announcements.filter((a) => a.severity === 'warning') },
};

export const Empty: Story = { args: { announcements: [] } };

export const LongBody: Story = {
  args: {
    announcements: [
      {
        ...announcements[0],
        body: 'A turma 07 tem aula ao vivo às 19h. O link abre 10 minutos antes e fecha 15 minutos depois do início — quem entrar atrasado assiste a gravação, que fica disponível no dia seguinte na aba de artefatos da lição correspondente.',
      },
    ],
  },
};
