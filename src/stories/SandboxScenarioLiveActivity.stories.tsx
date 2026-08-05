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
 * **A IA aqui é mockada** (`.storybook/mocks/iteraApi.ts`, 1,2s de espera): o
 * `@/api/iteraApi` é aliasado só na vitrine, então `respond()`/`judge()`
 * respondem sem rede. Antes disso a story mostrava a DEGRADAÇÃO — o build da
 * vitrine não seta `VITE_ITERA_API_BASE`, as duas chamadas lançavam na hora e o
 * dev via "a IA está indisponível" achando que estava vendo a atividade.
 */
const meta: Meta<typeof SandboxScenarioLiveActivity> = {
  title: 'Organisms/Activities/6 · BYOC (contexto do aluno)/3 · ao vivo (composer)',
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

/**
 * Compose (step 1) — write your own context, the composer INSIDE the window.
 * Enviar percorre o fluxo inteiro no canvas: espera → resposta → nota → veredito.
 */
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
