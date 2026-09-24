import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SandboxAIWithOptionsActivity } from '@/components/branded/activity/SandboxAIWithOptionsActivity';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { composeSandboxPrompt, rateSandbox, sendSandboxPrompt } from './interactions';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `chat_sandbox` — variante com `choices[]`.
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
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SandboxAIWithOptionsActivity>;

/** c1 "The vague ask" — one context chip actually helps; two are distractors. */
export const VagueAsk: Story = {
  render: () => <SandboxAIWithOptionsActivity activity={makeActivity('chat_sandbox', bySlug.c1)} onComplete={noop} />,
};

/** c3 "Show an example" — pasting an example format beats "please" / "short". */
export const ShowAnExample: Story = {
  render: () => <SandboxAIWithOptionsActivity activity={makeActivity('chat_sandbox', bySlug.c3)} onComplete={noop} />,
};

/** c4 "Too much context hurts" — dumping everything makes the answer worse. */
export const TooMuchContext: Story = {
  render: () => <SandboxAIWithOptionsActivity activity={makeActivity('chat_sandbox', bySlug.c4)} onComplete={noop} />,
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  render: () => (
    <SandboxAIWithOptionsActivity activity={makeActivity('chat_sandbox', bySlug.c1)} onComplete={noop} reveal />
  ),
};

/* ── Matrix row `chat_pick_context` (plan 20260924-activity-type-one-behavior-rule, T4) ──
 * The states below are the behaviour "pick ONE context chip". Until T4 the
 * `chat_sandbox` matrix row pointed only at the OPEN chat, which has 0 rows in
 * production; this renderer has 10 activities + 10 defs. The helpful chip of
 * c1 resolves to the canned result `especifico` (`quality: 'top'`). */
const CHIP_CERTO = 'pra uma redação de escola sobre meio ambiente';

/** C.answered — a chip is picked and NOT sent: "send" unlocks, nothing completes. */
export const ContextoEscolhido: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c1) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, CHIP_CERTO);
    await expect(within(canvasElement).getByTestId('sandbox-send')).not.toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — sent: the canned answer arrives and the step turns to "rate". */
export const RespostaRecebida: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c1) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, CHIP_CERTO);
    await sendSandboxPrompt(canvasElement);
    await expect(within(canvasElement).getByTestId('sandbox-rate-top')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.correct — the answer is strong and the learner rates it "strong". */
export const AvaliadaCorretamente: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c1) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, CHIP_CERTO);
    await sendSandboxPrompt(canvasElement);
    await rateSandbox(canvasElement, 'top');
    await expect(within(canvasElement).getByTestId('sandbox-reveal')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — the learner rates a strong answer "weak": critique + retry, no completion. */
export const AvaliadaIncorretamente: Story = {
  args: { activity: makeActivity('chat_sandbox', bySlug.c1) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, CHIP_CERTO);
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
  args: { activity: makeActivity('chat_sandbox', bySlug.c1, 'done') },
};
