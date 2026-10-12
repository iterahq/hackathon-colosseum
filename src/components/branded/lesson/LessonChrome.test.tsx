import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LessonChrome, HIT_SLOP, dayMinutes } from './LessonChrome';

describe('LessonChrome hit areas', () => {
  it('gives every control a 44 px hit area around its 36 px box', () => {
    render(
      <I18nProvider>
        <LessonChrome
          progressPct={40}
          muted={false}
          onToggleMuted={() => {}}
          onClose={() => {}}
          onBack={() => {}}
          onForward={() => {}}
          onJumpToCurrent={() => {}}
        />
      </I18nProvider>
    );
    const ids = ['lesson-close', 'lesson-prev', 'lesson-next', 'lesson-jump-current', 'lesson-sound-toggle'];
    expect(HIT_SLOP).toContain('before:-inset-1');
    for (const id of ids) {
      const button = screen.getByTestId(id);
      for (const cls of HIT_SLOP.split(' ')) expect(button.className, id).toContain(cls);
      expect(button.className, id).toMatch(/\bh-9\b/);
    }
  });
});

describe('LessonChrome time estimate', () => {
  const chrome = (total: number) => (
    <I18nProvider>
      <LessonChrome progressPct={0} muted={false} onToggleMuted={() => {}} onClose={() => {}} step={{ n: 1, total, day: 1 }} />
    </I18nProvider>
  );

  it('follows the number of activities, in steps of 5 minutes', () => {
    expect([1, 4, 6, 7, 12, 13, 18, 19].map(dayMinutes)).toEqual([5, 5, 5, 10, 10, 15, 15, 20]);
  });

  it('a day of 4 exercises reads about 5 min, a day of 18 activities about 15', () => {
    localStorage.setItem('itera.locale', 'en');
    const { unmount } = render(chrome(4));
    expect(screen.getByTestId('lesson-step')).toHaveTextContent('Day 1 · about 5 min · step 1 of 4');
    unmount();
    render(chrome(18));
    expect(screen.getByTestId('lesson-step')).toHaveTextContent('Day 1 · about 15 min · step 1 of 18');
    localStorage.clear();
  });
});
