import type { Meta, StoryObj } from '@storybook/react';
import { SandboxScenarioActivity } from '@/components/branded/activity/SandboxScenarioActivity';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * SandboxScenario — the deterministic sandbox chat activity. The `spec` IS a
 * `Scenario` run by the shared @iterahq/activity-spec/runtime. Stories mount two
 * of the six Contexto scenarios; drive them live in the canvas (send → rate →
 * add context → send → rate) to reach the reveal + enabled "Continuar".
 */
const bySlug = scenarios as Record<string, Record<string, unknown>>;

const meta: Meta<typeof SandboxScenarioActivity> = {
  title: 'Organisms/Activities/SandboxScenario',
  component: SandboxScenarioActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxScenarioActivity>;

/** c1 "The vague ask" — fixed openness, one context chip. */
export const VagueAsk: Story = {
  render: () => <SandboxScenarioActivity activity={makeActivity('sandbox_scenario', bySlug.c1)} onComplete={noop} />,
};

/** c6 "Bring your own context" — byoc openness, four slots + a chip. */
export const BringYourOwnContext: Story = {
  render: () => <SandboxScenarioActivity activity={makeActivity('sandbox_scenario', bySlug.c6)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => <SandboxScenarioActivity activity={makeActivity('sandbox_scenario', bySlug.c1)} onComplete={noop} reveal />,
};
