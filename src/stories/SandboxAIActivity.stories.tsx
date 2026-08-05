import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { SandboxAIActivity } from '@/components/branded/activity/SandboxAIActivity';
import { makeActivity } from './activityFixtures';
import { SANDBOX_OPEN_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { composeSandboxPrompt, rateSandbox, sendSandboxPrompt } from './interactions';

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
 *
 * ── FASE 3 (ADR-2) ─────────────────────────────────────────────────────────
 * O passo-a-passo do `ChatModel` era a última família de células adiadas deste
 * kind. Ele fecha aqui, com interação real: chip de seed → enviar → avaliar.
 * As stories esperam o typewriter terminar (`useAssistantStream`), então elas
 * levam ~2 s cada — é o preço de dirigir a animação de verdade em vez de
 * fingir que ela não existe.
 */
const meta: Meta<typeof SandboxAIActivity> = {
  title: 'Organisms/Activities/7 · Sandbox de chat/IA aberta',
  id: 'activities-ia-sandbox-aberta',
  component: SandboxAIActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SandboxAIActivity>;

/** Open chat — send the base prompt, rate the answer, reach the reveal. */
export const OpenChat: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC) },
};

/**
 * C.answered — prompt COMPOSTO e ainda não enviado. O composer nasce vazio de
 * propósito (Tainan: "sempre o usuário tem que inserir"); é o chip de seed que
 * o preenche, e é isso que destrava o "enviar".
 */
export const PromptComposto: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('sandbox-send')).toBeDisabled();
    await composeSandboxPrompt(canvasElement);
    await expect(canvas.getByTestId('sandbox-send')).not.toBeDisabled();
  },
};

/** C.submitted — enviado: a resposta canned chega e o passo vira "avaliar". */
export const RespostaRecebida: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement);
    await sendSandboxPrompt(canvasElement);
    await expect(within(canvasElement).getByTestId('sandbox-rate-top')).toBeInTheDocument();
    // Enviar NÃO conclui: no sandbox a conclusão é a AVALIAÇÃO certa.
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.correct — a resposta canned do cIA é `quality: 'top'`; "forte" é o acerto. */
export const AvaliadaCorretamente: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement);
    await sendSandboxPrompt(canvasElement);
    await rateSandbox(canvasElement, 'top');
    await expect(within(canvasElement).getByTestId('sandbox-reveal')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/**
 * D.incorrect — avaliar "fraca" uma resposta forte é rejeitado com a crítica
 * canned + "tentar de novo". O sandbox não deixa passar batido: a avaliação
 * É o exercício.
 */
export const AvaliadaIncorretamente: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC) },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement);
    await sendSandboxPrompt(canvasElement);
    await rateSandbox(canvasElement, 'ruim');
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
    await expect(canvas.getByTestId('sandbox-eval-retry')).toBeInTheDocument();
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Live-mode reveal — `reveal` shows the recap + enables Continuar without a run. */
export const RevealedInLive: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC), reveal: true },
};

/**
 * EIXO B — `status: 'done'`: cenário já concluído numa sessão anterior. O
 * `SandboxScenarioShell` propaga `isDone` para o hook (`readOnly`) e trata a
 * activity como assentada. Era o último kind sem story de `done`.
 */
export const Concluida: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_OPEN_SPEC, 'done') },
};
