import type { Meta, StoryObj } from '@storybook/react';
import { AuthProvider } from '@/auth/AuthContext';
import { SandboxScenarioLiveActivity } from '@/components/branded/activity/sandbox-live/SandboxScenarioLiveActivity';
import { makeActivity, noop } from './activityFixtures';
import { SANDBOX_BYOC_SPEC as BYOC_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `sandbox_scenario` — variante BYOC AO VIVO (contrato próprio).
 *
 * Aqui a autoria entrega `openness: 'byoc'` (ou `live: true`) + títulos/prompts,
 * e NÃO entrega `initialState`/`cannedResults`: a resposta vem de um LLM real
 * via itera-api, não de uma tabela determinística. Por isso este spec é
 * reconhecido por `isByocLive()` e NÃO passa no `SandboxScenarioSpecSchema` —
 * é a única exceção documentada no registro de fixtures.
 *
 * SandboxScenarioLive — the BYOC ("Bring Your Own Context") live composer.
 * Same "Cloud Cowork" window chrome as the deterministic `SandboxScenario`
 * (plan 20260717-iterahq-activities-visual-ux-redesign): instruction above,
 * transcript + composer inside the window at 100% width, standard send
 * button, rating buttons below near the action.
 *
 * `VITE_ITERA_API_BASE` is unset in the Storybook build, so `respond()`/
 * `judge()` synchronously throw "itera-api not configured" — the component's
 * OWN graceful-degrade path (never hard-blocks the learner) catches that and
 * shows a fallback answer, which is enough to drive the full compose → rate →
 * settle flow live in the canvas without any network mocking.
 */
const meta: Meta<typeof SandboxScenarioLiveActivity> = {
  title: 'Organisms/Activities/6 · Cenário com IA/Sandbox · BYOC ao vivo',
  id: 'activities-ia-sandbox-byoc-live',
  component: SandboxScenarioLiveActivity,
  decorators: [
    withActivityWidth,
    (Story) => (
      <AuthProvider>
        <Story />
      </AuthProvider>
    ),
  ],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxScenarioLiveActivity>;

/** Compose (step 1) — write your own context, the composer INSIDE the window. */
export const Compose: Story = {
  render: () => (
    <SandboxScenarioLiveActivity activity={makeActivity('sandbox_scenario', BYOC_SPEC)} onComplete={noop} />
  ),
};

/** Live-mode reveal — `reveal` shows Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => (
    <SandboxScenarioLiveActivity activity={makeActivity('sandbox_scenario', BYOC_SPEC)} onComplete={noop} reveal />
  ),
};
