import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SandboxAICompleteWordsActivity } from '@/components/branded/activity/SandboxAICompleteWordsActivity';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { rateSandbox, sendSandboxPrompt } from './interactions';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `chat_sandbox` — variante com `slots[]`.
 *
 * A autoria entrega lacunas (`select` com opções, ou texto livre) que o aluno
 * preenche para montar o prompt, envia e avalia a resposta. A presença de
 * `slots` é o que muda o contrato de autoria e o componente escolhido.
 *
 * Runtime determinístico (`cannedResults`) — sem mock de rede.
 */
const bySlug = scenarios as Record<string, Record<string, unknown>>;

const meta: Meta<typeof SandboxAICompleteWordsActivity> = {
  title: 'Organisms/Activities/7 · Sandbox de chat/Completar palavras',
  id: 'activities-ia-sandbox-slots',
  component: SandboxAICompleteWordsActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SandboxAICompleteWordsActivity>;

/** c2 "Who am I" — one persona slot reshapes the same question's answer. */
export const WhoAmI: Story = {
  render: () => <SandboxAICompleteWordsActivity activity={makeActivity('chat_sandbox', bySlug.c2)} onComplete={noop} />,
};

/** c5 "Your case, your question" — two slots (where + situation) personalize it. */
export const YourCase: Story = {
  render: () => <SandboxAICompleteWordsActivity activity={makeActivity('chat_sandbox', bySlug.c5)} onComplete={noop} />,
};

/** c6 "Final mission" — four slots build a full who/what/example prompt. */
export const FinalMission: Story = {
  render: () => <SandboxAICompleteWordsActivity activity={makeActivity('chat_sandbox', bySlug.c6)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => (
    <SandboxAICompleteWordsActivity activity={makeActivity('chat_sandbox', bySlug.c6)} onComplete={noop} reveal />
  ),
};

/* ── Matrix row `chat_fill_select` (plan 20260924-activity-type-one-behavior-rule, T4) ──
 * The states below are the behaviour "fill each slot from a set of options".
 * Production: 18 activities + 9 defs use `select` slots (1 more activity uses
 * a `text` slot — that is `chat_fill_type`, not this row). c2 has ONE select
 * slot; "meu irmão pequeno" resolves to a `quality: 'top'` canned result. */
async function pickSlotOption(canvasElement: HTMLElement, label: string) {
  const slots = within(within(canvasElement).getByTestId('sandbox-slots'));
  await userEvent.click(slots.getByRole('button', { name: label }));
}
const OPCAO = 'meu irmão pequeno';

/** C.answered — the slot is filled and NOT sent: "send" unlocks, nothing completes. */
export const OpcaoEscolhida: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c2) },
  play: async ({ args, canvasElement }) => {
    await pickSlotOption(canvasElement, OPCAO);
    await expect(within(canvasElement).getByTestId('sandbox-send')).not.toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — sent: the canned answer arrives and the step turns to "rate". */
export const RespostaRecebida: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c2) },
  play: async ({ args, canvasElement }) => {
    await pickSlotOption(canvasElement, OPCAO);
    await sendSandboxPrompt(canvasElement);
    await expect(within(canvasElement).getByTestId('sandbox-rate-top')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.correct — the answer fits the persona and the learner rates it "strong". */
export const AvaliadaCorretamente: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c2) },
  play: async ({ args, canvasElement }) => {
    await pickSlotOption(canvasElement, OPCAO);
    await sendSandboxPrompt(canvasElement);
    await rateSandbox(canvasElement, 'top');
    await expect(within(canvasElement).getByTestId('sandbox-reveal')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — the learner rates a strong answer "weak": critique + retry, no completion. */
export const AvaliadaIncorretamente: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c2) },
  play: async ({ args, canvasElement }) => {
    await pickSlotOption(canvasElement, OPCAO);
    await sendSandboxPrompt(canvasElement);
    await rateSandbox(canvasElement, 'ruim');
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c2, 'done') },
};
