import type { Meta, StoryObj } from '@storybook/react';
import { SandboxAIWithOptionsActivity } from '@/components/branded/activity/SandboxAIWithOptionsActivity';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `sandbox_scenario` — variante com `choices[]`.
 *
 * A autoria entrega chips de contexto: o aluno escolhe UM, envia e avalia a
 * resposta. É a mesma família de contrato do sandbox aberto, mas a presença de
 * `choices` muda o que a autoria precisa preencher e o componente escolhido.
 *
 * Runtime determinístico (`cannedResults`) — sem mock de rede; dá para percorrer
 * envio → avaliação → chip → envio → avaliação → reveal no canvas.
 */
const bySlug = scenarios as Record<string, Record<string, unknown>>;

const meta: Meta<typeof SandboxAIWithOptionsActivity> = {
  title: 'Organisms/Activities/7 · Sandbox de chat/Contexto por opções',
  id: 'activities-ia-sandbox-opcoes',
  component: SandboxAIWithOptionsActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxAIWithOptionsActivity>;

/** c1 "The vague ask" — one context chip actually helps; two are distractors. */
export const VagueAsk: Story = {
  render: () => <SandboxAIWithOptionsActivity activity={makeActivity('sandbox_scenario', bySlug.c1)} onComplete={noop} />,
};

/** c3 "Show an example" — pasting an example format beats "please" / "short". */
export const ShowAnExample: Story = {
  render: () => <SandboxAIWithOptionsActivity activity={makeActivity('sandbox_scenario', bySlug.c3)} onComplete={noop} />,
};

/** c4 "Too much context hurts" — dumping everything makes the answer worse. */
export const TooMuchContext: Story = {
  render: () => <SandboxAIWithOptionsActivity activity={makeActivity('sandbox_scenario', bySlug.c4)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => (
    <SandboxAIWithOptionsActivity activity={makeActivity('sandbox_scenario', bySlug.c1)} onComplete={noop} reveal />
  ),
};
