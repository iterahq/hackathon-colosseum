import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { makeActivity } from '@/stories/activityFixtures';

const activity = makeActivity('concept', { instruction: { text: 'Um modelo de dados.' } });

function renderStage(props: Partial<React.ComponentProps<typeof LiveActivityStage>>) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LiveActivityStage activity={activity} {...props} />
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('LiveActivityStage', () => {
  it('is a read-only mirror (inert + select-none) under the given testid', () => {
    renderStage({ readOnly: true, testid: 'instructor-activity-stage' });
    const wrapper = screen.getByTestId('instructor-activity-stage');
    expect(wrapper).toHaveAttribute('inert');
    expect(wrapper.className).toContain('select-none');
  });

  it('is interactive (no inert, no select-none) when not read-only', () => {
    renderStage({ testid: 'stage', onComplete: () => {} });
    const wrapper = screen.getByTestId('stage');
    expect(wrapper).not.toHaveAttribute('inert');
    expect(wrapper.className).not.toContain('select-none');
  });

  it('renders the timer slot and footer around the activity', () => {
    renderStage({
      testid: 'stage',
      timerSlot: <div data-testid="stage-timer" />,
      footer: <div data-testid="stage-footer" />,
    });
    expect(screen.getByTestId('stage-timer')).toBeTruthy();
    expect(screen.getByTestId('stage-footer')).toBeTruthy();
  });
});
