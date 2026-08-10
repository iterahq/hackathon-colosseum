import type { Meta, StoryObj } from '@storybook/react';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import { LiveWaitingIndicator } from '@/components/live/LiveWaitingIndicator';

/**
 * FeedbackFooter — the GLOBAL viewport-fixed answer-feedback bar (Duolingo /
 * OpenEnglish pattern). Slides up green (correct) / red (incorrect) after a
 * graded submit, carrying the correctness message + a "Continuar" CTA (async
 * self-paced) OR a "wait for the next one" hint (live/synchronous class).
 *
 * It is `position: fixed; bottom: 0` — in these stories it pins to the bottom
 * of the preview iframe.
 */
const meta: Meta<typeof FeedbackFooter> = {
  title: 'Organisms/Activities/9 · Partes compartilhadas/FeedbackFooter',
  id: 'activities-partes-feedback-footer',
  component: FeedbackFooter,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof FeedbackFooter>;

/** Correct answer → green footer + "Continuar" CTA (async player). */
export const Correct: Story = {
  render: () => <FeedbackFooter result={{ correct: true }} onContinue={() => {}} />,
};

/** Incorrect answer → red footer + "Continuar" CTA (async player). */
export const Incorrect: Story = {
  render: () => <FeedbackFooter result={{ correct: false }} onContinue={() => {}} />,
};

/** With an explanation line under the headline. */
export const WithExplanation: Story = {
  render: () => (
    <FeedbackFooter
      result={{
        correct: false,
        explanation: 'A chave estrangeira referencia a PK da outra tabela, não uma cópia dos dados.',
      }}
      onContinue={() => {}}
    />
  ),
};

/** Live/synchronous class → no self-advance CTA; a "wait for the next" hint. */
export const LiveWait: Story = {
  render: () => (
    <FeedbackFooter
      result={{ correct: true }}
      waitHint={<span className="text-menta">Pronto! Aguarde o professor avançar.</span>}
    />
  ),
};

/**
 * The REAL live hint, copied structurally from `LiveSessionPage`'s
 * `answeredWaitHint` — the hourglass indicator, the "wait for the next one"
 * sentence AND the elapsed-time tail.
 *
 * ⚠️ It exists because the `LiveWait` story above under-reports the widest case
 * by a lot: its hint is a bare 36-character sentence, while the one the learner
 * actually reads carries the indicator plus `· você levou N segundos` and is
 * more than twice as wide. That gap is why the squeezed footer of 2026-08-10
 * (Tainan, TG: *"feedback tá com design quebrado (nao consome a largura
 * disponivel)"*) never showed up in the vitrine. Do not shorten this hint to
 * make a screenshot look tidy — the tidy screenshot was the bug.
 */
function realLiveWaitHint(correct: boolean) {
  return (
    <span className="inline-flex items-center gap-2 justify-end flex-wrap">
      <LiveWaitingIndicator correct={correct} />
      <span className={correct ? 'text-menta' : 'text-clay'}>
        {correct ? 'Pronto! Aguarde o professor avançar.' : 'Não foi dessa vez. Aguarde o professor avançar.'}{' '}
        <span className="text-muted-foreground">· você levou 11 segundos</span>
      </span>
    </span>
  );
}

/**
 * Tainan's 2026-08-10 screenshot, reproduced: a `terminal_sandbox` recap next to
 * the real live wait hint. This is the widest content the bar ever carries, and
 * therefore the case the layout has to survive.
 */
export const LiveWaitWithRecap: Story = {
  render: () => (
    <FeedbackFooter
      result={{
        correct: true,
        explanation:
          'O `git add .` prepara todos os arquivos da pasta de uma vez. Rápido — e por isso vale olhar o `git status` antes, para não levar junto o que você não quer. 🎉',
      }}
      waitHint={realLiveWaitHint(true)}
    />
  ),
};

/** The same widest case on the wrong answer, where the recap matters most. */
export const LiveWaitWithRecapIncorrect: Story = {
  render: () => (
    <FeedbackFooter
      result={{
        correct: false,
        explanation:
          'O `git add .` prepara todos os arquivos da pasta de uma vez. Rápido — e por isso vale olhar o `git status` antes, para não levar junto o que você não quer.',
      }}
      waitHint={realLiveWaitHint(false)}
    />
  ),
};
