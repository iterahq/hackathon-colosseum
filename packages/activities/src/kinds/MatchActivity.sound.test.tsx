import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActivityProvider } from '../context.js';
import { createActivityI18n } from '../i18n/dictionary.js';
import { MatchActivity } from './MatchActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'match-sound',
  kind: 'match',
  status: 'todo',
  spec: {
    left: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ],
    right: [
      { id: 'ra', label: 'DefA' },
      { id: 'rb', label: 'DefB' },
    ],
    pairs: [
      { left_id: 'a', right_id: 'ra' },
      { left_id: 'b', right_id: 'rb' },
    ],
  },
} as unknown as PortableActivity;

const card = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement;

function renderWithSound() {
  const play = vi.fn();
  render(
    <ActivityProvider i18n={createActivityI18n('pt')} sound={{ play }}>
      <MatchActivity activity={activity} onComplete={vi.fn()} />
    </ActivityProvider>,
  );
  return play;
}

describe('MatchActivity sound cues', () => {
  it('picks, then connects, one cue per action', () => {
    const play = renderWithSound();
    fireEvent.click(card('Alpha'));
    expect(play.mock.calls).toEqual([['pick']]);
    fireEvent.click(card('DefA'));
    expect(play.mock.calls).toEqual([['pick'], ['connect']]);
  });

  it('does not sound disarming a card, nor tapping a right card with nothing armed', () => {
    const play = renderWithSound();
    fireEvent.click(card('DefA'));
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('Alpha'));
    expect(play.mock.calls).toEqual([['pick']]);
  });

  it('ticks when a pair is undone', () => {
    const play = renderWithSound();
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    play.mockClear();
    fireEvent.click(card('DefA'));
    expect(play.mock.calls).toEqual([['pick']]);
  });

  it('never announces right or wrong itself: the verdict belongs to the host at submit', () => {
    const play = renderWithSound();
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefB'));
    fireEvent.click(card('Beta'));
    fireEvent.click(card('DefA'));
    fireEvent.click(screen.getByTestId('match-submit'));
    const cues = play.mock.calls.map((c) => c[0]);
    expect(cues).not.toContain('correct');
    expect(cues).not.toContain('wrong');
  });

  it('stays silent, without crashing, when the host gave no sound port', () => {
    render(<MatchActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    expect(card('Alpha').getAttribute('data-connected')).toBe('true');
  });

  it('survives a port that throws', () => {
    render(
      <ActivityProvider
        i18n={createActivityI18n('pt')}
        sound={{
          play: () => {
            throw new Error('boom');
          },
        }}
      >
        <MatchActivity activity={activity} onComplete={vi.fn()} />
      </ActivityProvider>,
    );
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    expect(card('Alpha').getAttribute('data-connected')).toBe('true');
  });
});
