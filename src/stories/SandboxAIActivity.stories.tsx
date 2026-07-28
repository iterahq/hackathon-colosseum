import type { Meta, StoryObj } from '@storybook/react';
import { SandboxAIActivity } from '@/components/branded/activity/SandboxAIActivity';
import { makeActivity, noop } from './activityFixtures';
import { SANDBOX_OPEN_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `sandbox_scenario` — variante SEM construtor de contexto.
 *
 * O `spec` é um `Scenario` do `@iterahq/activity-spec/runtime` (validado no
 * Zod: `initialState` + `cannedResults` + `resultResolver`). Dentro do kind, a
 * FORMA da autoria decide o componente: sem `slots` e sem `choices`, o aluno
 * manda o `basePrompt` como está e depois avalia a resposta.
 *
 * Nada é mockado: o runtime é determinístico (respostas vêm de `cannedResults`),
 * então dá para percorrer envio → avaliação → reveal direto no canvas.
 */
const meta: Meta<typeof SandboxAIActivity> = {
  title: 'Organisms/Activities/6 · Cenário com IA/Sandbox · IA aberta',
  id: 'activities-ia-sandbox-aberta',
  component: SandboxAIActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxAIActivity>;

/** Open chat — send the base prompt, rate the answer, reach the reveal. */
export const OpenChat: Story = {
  render: () => <SandboxAIActivity activity={makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => <SandboxAIActivity activity={makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC)} onComplete={noop} reveal />,
};

/**
 * EIXO B — `status: 'done'`: cenário já concluído numa sessão anterior. O
 * `SandboxScenarioShell` propaga `isDone` para o hook (`readOnly`) e trata a
 * activity como assentada. Era o último kind sem story de `done`.
 */
export const Concluida: Story = {
  render: () => (
    <SandboxAIActivity
      activity={makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC, 'done')}
      onComplete={noop}
    />
  ),
};
