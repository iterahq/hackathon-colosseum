import type { ReactNode } from 'react';
import type { Meta, StoryObj, Decorator } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  ActivityProvider,
  useActivityHost,
  type ActivityApiPort,
  type ActivityJudgeVerdict,
} from '@iterahq/activities';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import { makeActivity, noop } from './activityFixtures';
import { DOCUMENT_AI_JUDGE_RUBRIC, DOCUMENT_AI_JUDGE_SPEC } from './behaviourFixtures';
import { withActivityWidth } from './decorators';

/**
 * BEHAVIOUR `document_ai_judge` — write, then an AI judge decides.
 *
 * Today it is `document` with `rubric.mode: "ai-judge"` (10 activities + 10
 * defs in production). Until this file, the `document` matrix row showed only
 * the reading card and the word-count reflection, and declared `D` as `na`.
 * Plan `20260924-activity-type-one-behavior-rule` (v3, ADR-1) makes it its own
 * kind. Fixture: production row `eb426dc5` (see `behaviourFixtures.ts`).
 *
 * ── WHY A NESTED PROVIDER ──────────────────────────────────────────────────
 * `DocumentActivity` shows this renderer only when the host supplies
 * `api.judge`. The Storybook host (`IteraActivityHost`) supplies no `api`,
 * because `VITE_ITERA_API_BASE` is not set here. The decorator below keeps
 * every port of the outer host and adds a FAKE `api` with a local verdict. No
 * network, no model: the value here is the screen and its states.
 *
 * `SemPortaDeJuiz` shows the violation the plan names ("no host-dependent
 * behaviour"): with no judge port the SAME row becomes a reflection.
 */
const verdict = (passed: boolean): ActivityJudgeVerdict => ({
  result_id: 'storybook-judge',
  activity_id: 'storybook',
  attempt: 1,
  status: passed ? 'passed' : 'failed',
  passed,
  score: passed ? 0.9 : 0.4,
  feedback: passed
    ? 'O brief cobre objetivo, política, guardrail e verificação.'
    : 'Falta o guardrail de escalonamento por exposição e a verificação do resultado.',
  criteria: [
    { criterion: 'Objetivo claro ligado a recebível/crédito', met: true },
    { criterion: 'Política = tabela de decisão de crédito', met: true },
    { criterion: 'Guardrail de escalonamento por exposição', met: passed },
    { criterion: 'Inclui verificação do resultado', met: passed },
  ],
  model: 'storybook-mock',
  progress_status: passed ? 'completed' : 'in_progress',
  judge_available: true,
});

function withJudge(passed: boolean): Decorator {
  const api: ActivityApiPort = {
    judge: () => new Promise((resolve) => setTimeout(() => resolve(verdict(passed)), 50)),
  };
  function JudgeHost({ children }: { children: ReactNode }) {
    const outer = useActivityHost();
    return (
      <ActivityProvider
        {...outer}
        api={api}
        identity={{ ...outer.identity, authenticated: true, loading: false }}
      >
        {children}
      </ActivityProvider>
    );
  }
  const decorator: Decorator = (Story) => (
    <JudgeHost>
      <Story />
    </JudgeHost>
  );
  return decorator;
}

const ANSWER =
  'OBJETIVO: pré-classificar pedidos de antecipação de recebível agro. FERRAMENTAS: ler recebíveis e ' +
  'consultar o histórico de safra. POLÍTICA: a tabela de decisão de crédito. GUARDRAIL: acima do ' +
  'limite de exposição, o caso vai para um humano. VERIFICAÇÃO: comparar a classificação com a decisão final.';

const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/5 · Produção/Document (IA avalia)',
  id: 'activities-producao-document-ai-judge',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/**
 * The row goes through the SAME collapse the Player applies on read
 * (`programs.service#mapActivity` → `resolveLocalizedSpec`, spec AND rubric):
 * the production payload carries bilingual `{ pt, en }` bags, and the
 * `document` renderers take plain strings.
 */
const activity = () =>
  makeActivity(
    'document',
    resolveLocalizedSpec(DOCUMENT_AI_JUDGE_SPEC, 'pt'),
    undefined,
    resolveLocalizedSpec(DOCUMENT_AI_JUDGE_RUBRIC, 'pt'),
  );

/** A.enabled + C.blank — the prompt, an empty answer and a disabled "send". */
export const Default: Story = {
  decorators: [withJudge(true)],
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('judge-submission-input')).toBeInTheDocument();
    await expect(canvas.getByTestId('judge-submit')).toBeDisabled();
  },
};

/** C.answered — the answer is written and NOT sent. */
export const RespostaEscrita: Story = {
  decorators: [withJudge(true)],
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('judge-submission-input'));
    await userEvent.paste(ANSWER);
    await expect(canvas.getByTestId('judge-submit')).not.toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — the judge passes it: heat-map + completion with the artifact. */
export const Aprovada: Story = {
  decorators: [withJudge(true)],
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('judge-submission-input'));
    await userEvent.paste(ANSWER);
    await userEvent.click(canvas.getByTestId('judge-submit'));
    await canvas.findByTestId('judge-heatmap');
    await expect(args.onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ artifact: expect.objectContaining({ type: 'document' }) }),
    );
  },
};

/** D.incorrect — the judge fails it: heat-map with unmet criteria, no completion, retry allowed. */
export const Reprovada: Story = {
  decorators: [withJudge(false)],
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('judge-submission-input'));
    await userEvent.paste('OBJETIVO: classificar pedidos.');
    await userEvent.click(canvas.getByTestId('judge-submit'));
    await canvas.findByTestId('judge-heatmap');
    await expect(args.onComplete).not.toHaveBeenCalled();
    await expect(canvas.getByTestId('judge-submit')).not.toBeDisabled();
  },
};

/** A.locked — the live gate expired: the same screen, read-only. */
export const Travada: Story = {
  decorators: [withJudge(true)],
  render: () => (
    <LiveActivityStage activity={activity()} readOnly onComplete={noop} testid="live-activity" />
  ),
};

/**
 * The drift, on screen: NO judge port. The same production row renders the
 * word-count REFLECTION instead — a different behaviour chosen by the host.
 */
export const SemPortaDeJuiz: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('judge-submit')).not.toBeInTheDocument();
    await expect(canvas.getByTestId('document-reflection-input')).toBeInTheDocument();
  },
};
