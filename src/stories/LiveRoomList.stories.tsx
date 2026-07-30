import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { LiveRoomList } from '@/components/live/LiveRoomList';
import { roomActionsFactory } from '@/utils/liveRoomActions';
import { noopModeration, sampleRoomRows, sampleRoster } from './liveFixtures';

const instructors = sampleRoster.filter((m) => m.isInstructor);

const actionsFor = roomActionsFactory({
  moderation: noopModeration,
  onToggleStage: () => {},
});

/**
 * LiveRoomList — the ONE class list of the live sidebar: everyone in the room in
 * cumulative podium order, each row carrying its state on the current activity.
 *
 * The professor's five actions per learner (star, take a star back, lower the
 * hand, stage, remove) open INLINE on the row, never in a popover: the list is
 * `overflow-y-auto` and would clip anything layered on top.
 */
const meta: Meta<typeof LiveRoomList> = {
  title: 'Organisms/Live/LiveRoomList',
  component: LiveRoomList,
  parameters: { layout: 'centered' },
  args: { rows: sampleRoomRows, instructors },
  render: (args) => (
    <div style={{ width: 348, height: 520, display: 'flex' }} className="border border-border bg-card rounded-2xl">
      <LiveRoomList {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof LiveRoomList>;

/** The learner's view: no actions, no correctness — just who is in the room. */
export const Learner: Story = {};

/** The professor's view: correctness, cumulative score and stars per row. */
export const Instructor: Story = { args: { showDetail: true, actionsFor } };

/** The five actions, open on the top row. Hover/tap the ⋯ to get here. */
export const ActionsOpen: Story = {
  args: { showDetail: true, actionsFor },
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByTestId('live-room-actions-open');
    await userEvent.click(first);
  },
};

/**
 * Removing confirms on the row itself — never in a modal. The class is watching
 * the projected screen, and a centred dialog turns discipline into a public trial.
 */
export const RemoveConfirmation: Story = {
  args: { showDetail: true, actionsFor },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByTestId('live-room-actions-open')[0]);
    await userEvent.click(canvas.getByTestId('live-room-remove'));
  },
};

/** Pull in flight: the stage is peer-to-peer, so the row waits on the learner. */
export const StagePending: Story = {
  args: {
    showDetail: true,
    actionsFor: roomActionsFactory({
      moderation: noopModeration,
      onToggleStage: () => {},
      stagePendingUserId: 'a',
    }),
  },
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByTestId('live-room-actions-open');
    await userEvent.click(first);
  },
};

/** Timed out: the learner is offline and can never answer the pull. Say so. */
export const StageUnreachable: Story = {
  args: {
    showDetail: true,
    actionsFor: roomActionsFactory({
      moderation: noopModeration,
      onToggleStage: () => {},
      stageUnreachableUserId: 'a',
    }),
  },
};

/** Someone's work already on the stage — dot on the avatar, "tirar" on the row. */
export const OnStage: Story = {
  args: {
    showDetail: true,
    actionsFor: roomActionsFactory({
      moderation: noopModeration,
      onToggleStage: () => {},
      stagedAuthor: { userId: 'a', name: 'Ana Souza', avatarUrl: null },
    }),
  },
};

/** Short viewport (see useCompactHeight): padding shrinks, the list keeps height. */
export const Compact: Story = { args: { showDetail: true, actionsFor, compact: true } };

/** Nobody joined yet. */
export const Empty: Story = { args: { rows: [], instructors: [] } };
