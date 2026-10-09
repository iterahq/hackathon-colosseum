import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { CodeChecksFeedback } from './CodeChecksFeedback.js';

const checks = [
  { id: 'a', label: 'first passed', hint: 'hint a' },
  { id: 'b', label: 'second failed', hint: 'hint b' },
  { id: 'c', label: 'third passed', hint: 'hint c' },
] as unknown as CodeCheck[];

const results = [
  { id: 'a', passed: true },
  { id: 'b', passed: false },
  { id: 'c', passed: true },
];

function setup(props: Partial<Parameters<typeof CodeChecksFeedback>[0]> = {}) {
  const onRetry = vi.fn();
  const onContinue = vi.fn();
  render(
    <CodeChecksFeedback
      checks={checks}
      results={results}
      allPassed={false}
      attemptsSpent={1}
      onRetry={onRetry}
      onContinue={onContinue}
      {...props}
    />
  );
  return { onRetry, onContinue };
}

const row = (id: string) => screen.getAllByTestId('code-check-item').find((li) => li.dataset.checkId === id)!;

describe('CodeChecksFeedback compact panel', () => {
  it('keeps the failed check and its hint visible', () => {
    setup();
    expect(row('b').className).not.toContain('hidden');
    expect(screen.getByTestId('code-check-hint')).toHaveTextContent('hint b');
    expect(screen.getByTestId('code-checks-score')).toHaveTextContent('2 de 3');
  });

  it('folds the passed checks behind a toggle that expands them', () => {
    setup();
    expect(row('a').className).toContain('hidden');
    expect(row('c').className).toContain('hidden');
    const toggle = screen.getByTestId('code-checks-passed-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2');

    fireEvent.click(toggle);
    expect(row('a').className).not.toContain('hidden');
    expect(row('c').className).not.toContain('hidden');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(row('a').className).toContain('hidden');
  });

  it('has no toggle when nothing passed or everything passed', () => {
    setup({ results: results.map((r) => ({ ...r, passed: false })) });
    expect(screen.queryByTestId('code-checks-passed-toggle')).toBeNull();
  });

  it('merges the locked-editor note into the attempts line', () => {
    setup();
    expect(screen.getByTestId('code-attempts')).toHaveTextContent(/travado/);
    expect(screen.queryByTestId('code-checks-frozen')).toBeNull();
  });

  it('keeps Try again and Continue anyway in a single row', () => {
    const { onRetry, onContinue } = setup();
    const retry = screen.getByTestId('code-checks-retry');
    const cont = screen.getByTestId('code-checks-continue');
    expect(retry.parentElement).toBe(cont.parentElement);
    expect(retry.parentElement?.className).toContain('flex-row');
    expect(cont).toHaveTextContent('Seguir mesmo assim');
    fireEvent.click(retry);
    fireEvent.click(cont);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('drops the locked note once the result is settled', () => {
    setup({ settled: true });
    expect(screen.getByTestId('code-attempts')).not.toHaveTextContent(/travado/);
  });
});
