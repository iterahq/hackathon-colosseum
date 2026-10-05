import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('gains the inert attribute when the stage locks and loses it when it reopens', () => {
    const stage = (readOnly: boolean) => (
      <MemoryRouter>
        <I18nProvider>
          <LiveActivityStage activity={activity} readOnly={readOnly} testid="stage" />
        </I18nProvider>
      </MemoryRouter>
    );
    const { rerender } = render(stage(false));
    const wrapper = screen.getByTestId('stage');
    expect(wrapper.hasAttribute('inert')).toBe(false);

    rerender(stage(true));
    expect(wrapper.getAttribute('inert')).toBe('');

    rerender(stage(false));
    expect(wrapper.hasAttribute('inert')).toBe(false);
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

  it('the footer sits OUTSIDE the inert wrapper, so its buttons stay clickable when read-only', () => {
    // This is what lets the reopen button (ADR-1) work at all: the activity is
    // inert the moment it is answered, so a button inside it would render and
    // refuse the click.
    renderStage({
      readOnly: true,
      testid: 'stage',
      footer: <button data-testid="stage-footer-action" />,
    });
    const wrapper = screen.getByTestId('stage');
    expect(wrapper).toHaveAttribute('inert');
    expect(wrapper.contains(screen.getByTestId('stage-footer-action'))).toBe(false);
  });

  it('bumping attempt remounts the same activity (ADR-1 reopen)', () => {
    const choice = makeActivity('single_choice', {
      instruction: { text: 'Escolha uma.' },
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      correct_option_id: 'a',
    });
    const view = render(
      <MemoryRouter>
        <I18nProvider>
          <LiveActivityStage activity={choice} attempt={0} onComplete={() => {}} />
        </I18nProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByTestId('single-choice-option')[0]);
    expect(screen.getAllByTestId('single-choice-option')[0]).toHaveAttribute(
      'data-selected',
      'true'
    );

    view.rerender(
      <MemoryRouter>
        <I18nProvider>
          <LiveActivityStage activity={choice} attempt={1} onComplete={() => {}} />
        </I18nProvider>
      </MemoryRouter>
    );
    expect(screen.getAllByTestId('single-choice-option')[0]).not.toHaveAttribute('data-selected');
  });
});
