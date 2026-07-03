import type { Meta, StoryObj } from '@storybook/react';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import { makeActivity, noop } from './activityFixtures';

/**
 * Match — connect left cards to right cards. Stories: default (unconnected),
 * partially connected (answered), all-correct, incorrect, disabled.
 */
const meta: Meta<typeof MatchActivity> = {
  title: 'Activity/Match',
  component: MatchActivity,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof MatchActivity>;

const wrap = { maxWidth: 640 } as const;

const SPEC = {
  instruction: { text: 'Associe cada termo à sua definição.' },
  left: [
    { id: 'pk', label: 'Chave primária' },
    { id: 'fk', label: 'Chave estrangeira' },
    { id: 'idx', label: 'Índice' },
  ],
  right: [
    { id: 'r-idx', label: 'Acelera buscas por coluna' },
    { id: 'r-pk', label: 'Identifica unicamente uma linha' },
    { id: 'r-fk', label: 'Referencia a PK de outra tabela' },
  ],
  pairs: [
    { left_id: 'pk', right_id: 'r-pk' },
    { left_id: 'fk', right_id: 'r-fk' },
    { left_id: 'idx', right_id: 'r-idx' },
  ],
};

export const Default: Story = {
  render: () => (
    <div style={wrap}>
      <MatchActivity activity={makeActivity('match', SPEC)} onComplete={noop} />
    </div>
  ),
};

export const PartiallyConnected: Story = {
  render: () => (
    <div style={wrap}>
      <MatchActivity activity={makeActivity('match', SPEC)} onComplete={noop} initialConnections={{ pk: 'r-pk' }} />
    </div>
  ),
};

export const Correct: Story = {
  render: () => (
    <div style={wrap}>
      <MatchActivity
        activity={makeActivity('match', SPEC)}
        onComplete={noop}
        initialConnections={{ pk: 'r-pk', fk: 'r-fk', idx: 'r-idx' }}
        initialSubmitted
      />
    </div>
  ),
};

export const Incorrect: Story = {
  render: () => (
    <div style={wrap}>
      <MatchActivity
        activity={makeActivity('match', SPEC)}
        onComplete={noop}
        initialConnections={{ pk: 'r-fk', fk: 'r-pk', idx: 'r-idx' }}
        initialSubmitted
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={wrap}>
      <MatchActivity
        activity={makeActivity('match', SPEC, 'done')}
        onComplete={noop}
        initialConnections={{ pk: 'r-pk', fk: 'r-fk', idx: 'r-idx' }}
        initialSubmitted
      />
    </div>
  ),
};
