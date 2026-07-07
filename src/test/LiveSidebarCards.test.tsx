import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveRosterCard } from '@/components/live/LiveRosterCard';
import { LiveAnswerersCard } from '@/components/live/LiveAnswerersCard';
import type { ClassPresenceMember, ClassAnswerer } from '@/types/liveClass';

describe('LiveRosterCard', () => {
  const roster: ClassPresenceMember[] = [
    { userId: 'p', name: 'Prof', isInstructor: true },
    { userId: 'me', name: 'Eu', isInstructor: false },
  ];

  it('shows the count and lists members including the self user', () => {
    render(
      <I18nProvider>
        <LiveRosterCard roster={roster} selfUserId="me" />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-roster-count').textContent).toBe('2');
    const list = screen.getByTestId('live-roster-list');
    expect(list.textContent).toContain('Prof');
    expect(list.textContent).toContain('Eu');
  });
});

describe('LiveAnswerersCard', () => {
  const answerers: ClassAnswerer[] = [
    { userId: 'a', name: 'Ana', state: 'done' },
    { userId: 'b', name: 'Beto', state: 'wrong' },
    { userId: 'c', name: 'Cida', state: 'pending' },
  ];

  it('counts done over total and renders a row per learner state', () => {
    render(
      <I18nProvider>
        <LiveAnswerersCard answerers={answerers} />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-answerers-count').textContent).toBe('1/3');
    const list = screen.getByTestId('live-answerers-list');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(list.querySelector('[data-state="wrong"]')?.textContent).toContain('Beto');
  });

  it('hideCorrectness counts answered (done + wrong) instead of only done', () => {
    render(
      <I18nProvider>
        <LiveAnswerersCard answerers={answerers} hideCorrectness />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-answerers-count').textContent).toBe('2/3');
  });
});
