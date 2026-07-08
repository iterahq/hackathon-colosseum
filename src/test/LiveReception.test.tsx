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
  it('count matches the chips — everyone in the room, instructor included', () => {
    renderReception(roster);
    expect(screen.getByTestId('live-reception-count').textContent).toBe('3');
    const chips = screen.getByTestId('live-reception-roster');
    expect(chips.textContent).toContain('Prof');
    expect(chips.textContent).toContain('Ana');
    expect(chips.textContent).toContain('Beto');
  });

  it('caps the chips and shows a +N overflow for large classes', () => {
    const big: ClassPresenceMember[] = Array.from({ length: 30 }, (_, n) => ({
      userId: `u${n}`,
      name: `User ${n}`,
      isInstructor: false,
    }));
    renderReception(big);
    expect(screen.getByTestId('live-reception-count').textContent).toBe('30');
    // 24 chips + 1 overflow chip = 25 list items
    expect(screen.getByTestId('live-reception-roster').querySelectorAll('li')).toHaveLength(25);
    expect(screen.getByTestId('live-reception-roster').textContent).toContain('+6');
  });
});
