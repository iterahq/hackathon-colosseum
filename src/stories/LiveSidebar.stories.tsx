import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveHandButton } from '@/components/live/LiveHandButton';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { noopModeration, sampleAnswerers, sampleRoomRows, sampleRoster } from './liveFixtures';

/**
 * LiveSidebar — the ONE right-hand panel of the live class. Both roles see the
 * same room list (podium order, kept live); the role adds the rest.
 *
 * Learner: the raise-hand toggle pinned at the top (outside the collapsible body,
 * so it is never missed) plus the participation pulse. Instructor: activity stats,
 * the stage banner and the per-student actions.
 *
 * ⚠️ The room list is `lg:`-gated in BOTH roles — below 1024 px it collapses
 * behind the toggle. View these stories on a desktop-width canvas.
 */
const meta: Meta<typeof LiveSidebar> = {
  title: 'Organisms/Live/LiveSidebar',
  component: LiveSidebar,
  parameters: { layout: 'fullscreen' },
  args: { roster: sampleRoster, answerers: sampleAnswerers, rows: sampleRoomRows },
  render: (args) => (
    <div style={{ display: 'flex', height: '100dvh' }}>
      <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
        (coluna da atividade)
      </div>
      <LiveSidebar {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof LiveSidebar>;

/** The learner: hand at the top, pulse, room list. No actions on the rows. */
export const Learner: Story = {
  args: {
    role: 'learner',
    handSlot: <LiveHandButton full raised={false} onToggle={() => {}} />,
  },
};

/** Hand up: it stays visible at the top of the panel while the class runs. */
export const LearnerHandRaised: Story = {
  args: {
    role: 'learner',
    handSlot: <LiveHandButton full raised onToggle={() => {}} />,
  },
};

/**
 * Reception: the class hasn't started, so there is no activity — but the sidebar
 * (and the hand) is already there, which is what lets a learner ask something
 * before the first question.
 */
export const LearnerReception: Story = {
  args: {
    role: 'learner',
    hasActivity: false,
    handSlot: <LiveHandButton full raised={false} onToggle={() => {}} />,
  },
};

/** The professor: stats, per-row actions and the bottom bar. */
export const Instructor: Story = {
  args: {
    role: 'instructor',
    activityIndex: 2,
    activityCount: 6,
    moderation: noopModeration,
    onToggleStage: () => {},
  },
};

/** Someone's work is on the stage — the banner says whose, and offers to clear. */
export const InstructorWithStage: Story = {
  args: {
    role: 'instructor',
    activityIndex: 2,
    activityCount: 6,
    moderation: noopModeration,
    onToggleStage: () => {},
    stagedAuthor: { userId: 'a', name: 'Ana Souza', avatarUrl: null },
  },
};

/** Instructor during reception: no activity yet, so the rows go inert. */
export const InstructorReception: Story = {
  args: {
    role: 'instructor',
    hasActivity: false,
    moderation: noopModeration,
    onToggleStage: () => {},
  },
};
