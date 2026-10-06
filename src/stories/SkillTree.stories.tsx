import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkillTree } from '@/components/branded';
import {
  completedProgram,
  fixtureProgram,
  freshProgram,
  program,
  unlaunchedUnitProgram,
} from './skillTreeFixtures';

const meta: Meta<typeof SkillTree> = {
  title: 'Organisms/SkillTree',
  component: SkillTree,
  render: (args) => (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <SkillTree {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof SkillTree>;

export const Default: Story = { args: { program, onOpenLesson: () => {} } };

const wideRender: Story['render'] = (args) => (
  <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
    <SkillTree {...args} />
  </div>
);

/** Mid-trail: the primary node is half done, so the callout reads "Continue". */
export const WindingTrail: Story = {
  args: { program: fixtureProgram, onOpenLesson: () => {} },
  render: wideRender,
};

/** Day one: nothing done, the first node is primary and the callout reads "Start". */
export const FirstDay: Story = {
  args: { program: freshProgram, onOpenLesson: () => {} },
  render: wideRender,
};

/** Every lesson done: no primary node, no callout, the whole path is filled. */
export const Completed: Story = {
  args: { program: completedProgram, onOpenLesson: () => {} },
  render: wideRender,
};

/** A unit with no lessons yet shows the empty hint under its banner. */
export const UnitNotLaunched: Story = {
  args: { program: unlaunchedUnitProgram, onOpenLesson: () => {} },
  render: wideRender,
};

/** Desktop: the backdrop covers the whole page, the trail stays a centered vertical path. */
export const FullPage: Story = {
  args: { program: fixtureProgram, onOpenLesson: () => {} },
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <div style={{ padding: 40 }}>
      <SkillTree {...args} />
    </div>
  ),
};

/** Phone width: narrower zig-zag, callout clamped inside the trail. */
export const Mobile: Story = {
  args: { program: fixtureProgram, onOpenLesson: () => {} },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: (args) => <SkillTree {...args} />,
};
