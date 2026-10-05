import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LessonChrome, HIT_SLOP } from './LessonChrome';

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
