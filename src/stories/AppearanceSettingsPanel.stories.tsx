import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppearanceSettingsPanel } from '@/components/data-layer/AppearanceSettingsPanel';
import { preferences } from './dataLayerFixtures';

const meta: Meta<typeof AppearanceSettingsPanel> = {
  title: 'DataLayer/AppearanceSettingsPanel',
  component: AppearanceSettingsPanel,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 420 }}>
      <AppearanceSettingsPanel {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof AppearanceSettingsPanel>;

export const DarkPtBr: Story = { args: { preferences } };

export const LightEnUs: Story = {
  args: { preferences: { ...preferences, theme: 'light', language: 'en-US' } },
};

export const SystemTheme: Story = {
  args: { preferences: { ...preferences, theme: 'system' } },
};

export const SoundOff: Story = {
  args: { preferences: { ...preferences, soundEffectsEnabled: false } },
};
