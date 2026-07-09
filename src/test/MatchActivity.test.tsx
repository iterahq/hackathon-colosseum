import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import type { Activity } from '@/types/content';

/**
 * Match activity UX rework (2026-07): ordinal number badges (not colored dots),
 * neutral pre-submit styling, deselect-clears-both, and a clean green/red
 * result state. These assert the behavior contract the renderer must keep.
 */

const SPEC = {
  left: [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ],
  right: [
    { id: 'ra', label: 'DefA' },
    { id: 'rb', label: 'DefB' },
    { id: 'rc', label: 'DefC' },
  ],
  pairs: [
    { left_id: 'a', right_id: 'ra' },
    { left_id: 'b', right_id: 'rb' },
    { left_id: 'c', right_id: 'rc' },
  ],
};

function makeActivity(spec: Record<string, unknown>, status?: Activity['status']): Activity {
  return { id: 't-match', lessonId: 'l', ordinal: 0, kind: 'match', spec, rubric: null, status };
}

function renderMatch(spec = SPEC, props: Partial<React.ComponentProps<typeof MatchActivity>> = {}) {
  const onComplete = props.onComplete ?? vi.fn();
  render(
    <I18nProvider>
      <MatchActivity activity={makeActivity(spec)} onComplete={onComplete} {...props} />
    </I18nProvider>,
  );
  return onComplete;
}

/** The <button> card whose body contains `label`. */
function card(label: string) {
  return screen.getByText(label).closest('button') as HTMLButtonElement;
}

describe('MatchActivity — pairing UX', () => {
  it('pre-submit shows NO correctness colors — every badge is neutral, no green/red', () => {
    renderMatch();
    // Pair Alpha -> DefA.
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    const badges = screen.getAllByTestId('match-badge');
    expect(badges).toHaveLength(2); // one on each card of the pair
    for (const b of badges) expect(b.getAttribute('data-state')).toBe('neutral');
  });

  it('numbers pairs 1,2,3 in the order the learner creates them, on BOTH cards', () => {
    renderMatch();
    // First pair (1): Beta -> DefB
    fireEvent.click(card('Beta'));
    fireEvent.click(card('DefB'));
    // Second pair (2): Alpha -> DefA
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));

    expect(within(card('Beta')).getByTestId('match-badge')).toHaveTextContent('1');
    expect(within(card('DefB')).getByTestId('match-badge')).toHaveTextContent('1');
    expect(within(card('Alpha')).getByTestId('match-badge')).toHaveTextContent('2');
    expect(within(card('DefA')).getByTestId('match-badge')).toHaveTextContent('2');
  });

  it('tapping either card of an existing pair DESELECTS it — removes the number from BOTH cards', () => {
    renderMatch();
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    expect(screen.getAllByTestId('match-badge')).toHaveLength(2);

    // Re-tap the LEFT card of the pair → both badges gone, both freed.
    fireEvent.click(card('Alpha'));
    expect(screen.queryAllByTestId('match-badge')).toHaveLength(0);
    expect(card('Alpha').getAttribute('data-connected')).toBeNull();
    expect(card('DefA').getAttribute('data-connected')).toBeNull();
  });

  it('deselect via the RIGHT card also clears both, freeing them to re-pair', () => {
    renderMatch();
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    // Re-tap the RIGHT card → clears the pair.
    fireEvent.click(card('DefA'));
    expect(screen.queryAllByTestId('match-badge')).toHaveLength(0);

    // Re-pair Alpha with a different right card — proves both were freed.
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefB'));
    expect(within(card('Alpha')).getByTestId('match-badge')).toHaveTextContent('1');
    expect(within(card('DefB')).getByTestId('match-badge')).toHaveTextContent('1');
  });

  it('after submit, correct pairs read GREEN(check) and incorrect read RED(cross), keeping the number', () => {
    // Alpha->DefB (wrong), Beta->DefA (wrong), Gamma->DefC (correct)
    renderMatch(SPEC, {
      initialConnections: { a: 'rb', b: 'ra', c: 'rc' },
      initialSubmitted: true,
    });
    const badgeIn = (label: string) => within(card(label)).getByTestId('match-badge');
    expect(badgeIn('Gamma').getAttribute('data-state')).toBe('correct');
    expect(badgeIn('DefC').getAttribute('data-state')).toBe('correct');
    expect(badgeIn('Alpha').getAttribute('data-state')).toBe('incorrect');
    expect(badgeIn('Beta').getAttribute('data-state')).toBe('incorrect');
  });

  it('completes correct only when every pair matches spec — in ONE submit click', () => {
    const onComplete = renderMatch();
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    fireEvent.click(card('Beta'));
    fireEvent.click(card('DefB'));
    fireEvent.click(card('Gamma'));
    fireEvent.click(card('DefC'));
    // ONE-STEP: submit grades AND completes — no second "Marcar como concluída".
    fireEvent.click(screen.getByTestId('match-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('activity-done')).toBeNull();
    const btn = screen.getByTestId('match-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent ?? '').toMatch(/Enviado/i);
  });
});
