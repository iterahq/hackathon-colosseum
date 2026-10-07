import type { Meta, StoryObj } from '@storybook/react-vite';
import { LessonSaveError } from '@/components/branded/lesson/LessonSaveError';
import { LessonStepActions } from '@/components/branded/lesson/LessonStepActions';

const noop = () => {};

const meta: Meta<typeof LessonStepActions> = {
  title: 'Lesson/LessonStepActions',
  component: LessonStepActions,
  parameters: { layout: 'centered' },
  args: { onContinue: noop },
  render: (args) => (
    <div style={{ width: 358 }}>
      <LessonStepActions {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof LessonStepActions>;

export const ContinueOnly: Story = {};

/** A missed exercise opened again: the retry sits beside Continuar. */
export const MissedExercise: Story = { args: { onRetry: noop } };

export const Saving: Story = { args: { onRetry: noop, busy: true } };

/** The narrowest phone the player supports. */
export const Narrow320: Story = {
  args: { onRetry: noop },
  render: (args) => (
    <div style={{ width: 288 }}>
      <LessonStepActions {...args} />
    </div>
  ),
};

export const SaveFailed: Story = {
  render: () => (
    <div style={{ width: 358 }}>
      <LessonSaveError onRetry={noop} />
    </div>
  ),
};
