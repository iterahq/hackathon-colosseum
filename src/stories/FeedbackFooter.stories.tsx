import type { Meta, StoryObj } from '@storybook/react';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';

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
  title: 'Organisms/Activities/FeedbackFooter',
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
