import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveAnswerersCard } from '@/components/live/LiveAnswerersCard';
import { sampleAnswerers } from './liveFixtures';

/**
 * LiveAnswerersCard — "concluíram": who has answered the current activity.
 * The instructor view keeps full correctness (right/wrong + elapsed); the
 * student view passes `hideCorrectness` so peers only see answered-vs-pending.
 */
const meta: Meta<typeof LiveAnswerersCard> = {
  title: 'Molecules/Live/LiveAnswerersCard',
  component: LiveAnswerersCard,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveAnswerersCard>;

/** Instructor view — shows correct/wrong and each learner's time. */
export const Instructor: Story = { args: { answerers: sampleAnswerers, hideCorrectness: false } };

/** Student view — correctness and timings are hidden from peers. */
export const Student: Story = { args: { answerers: sampleAnswerers, hideCorrectness: true } };

/** No learners yet. */
export const Empty: Story = { args: { answerers: [] } };
