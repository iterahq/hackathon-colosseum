import type { Meta, StoryObj } from '@storybook/react';
import { SandboxAICompleteWordsActivity } from '@/components/branded/activity/SandboxAICompleteWordsActivity';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * SandboxAICompleteWords — the learner assembles the prompt by filling slots
 * (`scenario.slots`: select chips or free text), sends, then rates the answer.
 * Drive it in the canvas (send → rate → fill slots → send → rate) to the reveal.
 */
const bySlug = scenarios as Record<string, Record<string, unknown>>;

const meta: Meta<typeof SandboxAICompleteWordsActivity> = {
  title: 'Organisms/Activities/Sandbox/CompleteWords',
  component: SandboxAICompleteWordsActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxAICompleteWordsActivity>;

/** c2 "Who am I" — one persona slot reshapes the same question's answer. */
export const WhoAmI: Story = {
  render: () => <SandboxAICompleteWordsActivity activity={makeActivity('sandbox_scenario', bySlug.c2)} onComplete={noop} />,
};

/** c5 "Your case, your question" — two slots (where + situation) personalize it. */
export const YourCase: Story = {
  render: () => <SandboxAICompleteWordsActivity activity={makeActivity('sandbox_scenario', bySlug.c5)} onComplete={noop} />,
};

/** c6 "Final mission" — four slots build a full who/what/example prompt. */
export const FinalMission: Story = {
  render: () => <SandboxAICompleteWordsActivity activity={makeActivity('sandbox_scenario', bySlug.c6)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => (
    <SandboxAICompleteWordsActivity activity={makeActivity('sandbox_scenario', bySlug.c6)} onComplete={noop} reveal />
  ),
};
