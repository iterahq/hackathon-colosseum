import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveReception } from '@/components/live/LiveReception';
import type { ClassPresenceMember } from '@/types/liveClass';

const roster: ClassPresenceMember[] = [
  { userId: 'i', name: 'Prof', isInstructor: true },
  { userId: 'a', name: 'Ana', isInstructor: false },
  { userId: 'b', name: 'Beto', isInstructor: false },
];

function renderReception(r: ClassPresenceMember[]) {
  return render(
    <I18nProvider>
      <LiveReception roster={r} />
    </I18nProvider>
  );
}

describe('LiveReception', () => {
  it('shows the total in-room count and lists only learners', () => {
    renderReception(roster);
    expect(screen.getByTestId('live-reception-count').textContent).toBe('3');
    const chips = screen.getByTestId('live-reception-roster');
    expect(chips.textContent).toContain('Ana');
    expect(chips.textContent).toContain('Beto');
    expect(chips.textContent).not.toContain('Prof');
  });

  it('omits the learner chips when only the instructor is present', () => {
    renderReception([{ userId: 'i', name: 'Prof', isInstructor: true }]);
    expect(screen.queryByTestId('live-reception-roster')).toBeNull();
    expect(screen.getByTestId('live-reception-count').textContent).toBe('1');
  });
});
