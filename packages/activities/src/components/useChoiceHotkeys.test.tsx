import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SingleChoiceActivity } from '../kinds/SingleChoiceActivity.js';
import type { PortableActivity } from '../renderer.js';

const make = (id: string) =>
  ({
    id,
    kind: 'single_choice',
    status: 'todo',
    spec: {
      options: [
        { id: 'a', label: `${id} Alpha` },
        { id: 'b', label: `${id} Beta` },
      ],
      correct_option_id: 'a',
    },
  }) as unknown as PortableActivity;

const inert = (el: HTMLElement | null) => el?.setAttribute('inert', '');
const selectedIn = (root: HTMLElement) => root.querySelectorAll('[data-selected="true"]').length;

describe('useChoiceHotkeys scope', () => {
  it('does nothing under an inert ancestor, for a letter and for Enter', () => {
    const onComplete = vi.fn();
    const { container } = render(
      <div ref={inert}>
        <SingleChoiceActivity activity={make('one')} onComplete={onComplete} />
      </div>,
    );
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(selectedIn(container)).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('gives a loose key to the first live activity only', () => {
    render(
      <>
        <div data-testid="first">
          <SingleChoiceActivity activity={make('one')} onComplete={vi.fn()} />
        </div>
        <div data-testid="second">
          <SingleChoiceActivity activity={make('two')} onComplete={vi.fn()} />
        </div>
      </>,
    );
    fireEvent.keyDown(window, { key: 'a' });
    expect(selectedIn(screen.getByTestId('first'))).toBe(1);
    expect(selectedIn(screen.getByTestId('second'))).toBe(0);
  });

  it('skips an inert first activity and a key aimed inside the second is its own', () => {
    render(
      <>
        <div ref={inert} data-testid="first">
          <SingleChoiceActivity activity={make('one')} onComplete={vi.fn()} />
        </div>
        <div data-testid="second">
          <SingleChoiceActivity activity={make('two')} onComplete={vi.fn()} />
        </div>
      </>,
    );
    fireEvent.keyDown(window, { key: 'b' });
    expect(selectedIn(screen.getByTestId('second'))).toBe(1);
    expect(selectedIn(screen.getByTestId('first'))).toBe(0);
  });
});
