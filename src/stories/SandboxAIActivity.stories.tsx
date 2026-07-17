import type { Meta, StoryObj } from '@storybook/react';
import { SandboxAIActivity } from '@/components/branded/activity/SandboxAIActivity';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * SandboxAI — the open sandbox chat (type "IA"). The spec carries no context
 * builder (no slots, no choices): the learner sends the base prompt as-is, then
 * rates the answer. Drive it in the canvas (send → rate) to reach the reveal.
 */
const bySlug = scenarios as Record<string, Record<string, unknown>>;

const meta: Meta<typeof SandboxAIActivity> = {
  title: 'Organisms/Activities/Sandbox/AI',
  component: SandboxAIActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxAIActivity>;

/** Open chat — send the base prompt, rate the answer, reach the reveal. */
export const OpenChat: Story = {
  render: () => <SandboxAIActivity activity={makeActivity('sandbox_scenario', bySlug.cIA)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => <SandboxAIActivity activity={makeActivity('sandbox_scenario', bySlug.cIA)} onComplete={noop} reveal />,
};
