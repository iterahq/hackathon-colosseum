import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveReception } from '@/components/live/LiveReception';
import { sampleRoster } from './liveFixtures';

/**
 * LiveReception — the lobby a learner lands on before the professor starts the
 * class, so the session never opens straight into the first question. Shows
 * who's already in the room while everyone waits.
 */
const meta: Meta<typeof LiveReception> = {
  title: 'Organisms/Live/LiveReception',
  component: LiveReception,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof LiveReception>;

/** Several learners already waiting in the lobby. */
export const WithLearners: Story = { args: { roster: sampleRoster } };

/** First to arrive — empty room. */
export const Empty: Story = { args: { roster: [] } };
