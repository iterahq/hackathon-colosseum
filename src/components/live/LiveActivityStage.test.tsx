import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import type { Activity } from '@/types/content';

// The real kinds read `priorAnswer` ONCE, in a `useState` initializer. The stub
// does the same, so a prior answer that arrives after mount is only visible
// here if the stage re-mounts the activity for it.
vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({ priorAnswer }: { priorAnswer?: ActivityCompleteDetail }) => {
    const [seeded] = useState(() => JSON.stringify(priorAnswer?.actions?.map((a) => a.payload) ?? null));
    return <div data-testid="stub-activity" data-seeded={seeded} />;
  },
}));

import { LiveActivityStage } from './LiveActivityStage';

const activity = { id: 'a1', lessonId: 'l1', ordinal: 1, kind: 'single_choice', spec: {}, rubric: null } as Activity;
const picked: ActivityCompleteDetail = {
  actions: [{ type: 'answer_submitted', at: 2000, payload: { option_ids: ['b'] } }],
};

describe('LiveActivityStage — a prior answer that arrives after mount', () => {
  it('re-mounts the activity so the kind can seed from it', () => {
    const view = render(<LiveActivityStage activity={activity} />);
    expect(screen.getByTestId('stub-activity')).toHaveAttribute('data-seeded', 'null');

    // The stored answer is read in an effect: it lands one render late.
    view.rerender(<LiveActivityStage activity={activity} priorAnswer={picked} />);
    expect(screen.getByTestId('stub-activity')).toHaveAttribute('data-seeded', '[{"option_ids":["b"]}]');
  });

  it('re-mounts it blank again when the answer is taken back (round re-opened)', () => {
    const view = render(<LiveActivityStage activity={activity} priorAnswer={picked} />);
    view.rerender(<LiveActivityStage activity={activity} />);
    expect(screen.getByTestId('stub-activity')).toHaveAttribute('data-seeded', 'null');
  });

  it('does not re-mount while nothing about the answer changes', () => {
    const view = render(<LiveActivityStage activity={activity} priorAnswer={picked} />);
    const first = screen.getByTestId('stub-activity');
    view.rerender(<LiveActivityStage activity={{ ...activity, status: 'done' }} priorAnswer={{ ...picked }} />);
    expect(screen.getByTestId('stub-activity')).toBe(first);
  });
});
