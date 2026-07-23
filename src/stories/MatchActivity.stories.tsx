import type { Meta, StoryObj } from '@storybook/react';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import { makeActivity, noop } from './activityFixtures';
import { MATCH_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `match` — associação entre dois conjuntos.
 *
 *   { instruction?, left: [{ id, label? }], right: [{ id, label? }], pairs: [{ left_id, right_id }] }
 *
 * Contrato tipado: cada `pair` precisa referenciar um id existente em `left` e
 * em `right`. Função pedagógica própria (ligar, não escolher) → grupo próprio.
 *
 * As stories abaixo são variações de ESTADO do mesmo contrato.
 */
const meta: Meta<typeof MatchActivity> = {
  title: 'Organisms/Activities/3 · Associação/Match',
  id: 'activities-associacao-match',
  component: MatchActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof MatchActivity>;

export const Default: Story = {
  render: () => <MatchActivity activity={makeActivity('match', SPEC)} onComplete={noop} />,
};

export const PartiallyConnected: Story = {
  render: () => (
    <MatchActivity activity={makeActivity('match', SPEC)} onComplete={noop} initialConnections={{ pk: 'r-pk' }} />
  ),
};

export const Correct: Story = {
  render: () => (
    <MatchActivity
      activity={makeActivity('match', SPEC)}
      onComplete={noop}
      initialConnections={{ pk: 'r-pk', fk: 'r-fk', idx: 'r-idx' }}
      initialSubmitted
    />
  ),
};

export const Incorrect: Story = {
  render: () => (
    <MatchActivity
      activity={makeActivity('match', SPEC)}
      onComplete={noop}
      initialConnections={{ pk: 'r-fk', fk: 'r-pk', idx: 'r-idx' }}
      initialSubmitted
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <MatchActivity
      activity={makeActivity('match', SPEC, 'done')}
      onComplete={noop}
      initialConnections={{ pk: 'r-pk', fk: 'r-fk', idx: 'r-idx' }}
      initialSubmitted
    />
  ),
};
