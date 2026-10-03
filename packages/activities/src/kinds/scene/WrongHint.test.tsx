import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WrongHint } from './WrongHint.js';
import { useWrongHint } from './useWrongHint.js';

describe('WrongHint', () => {
  it('shows the bottom bar with the text and mirrors it in the live region', () => {
    render(<WrongHint text="Look at the label" />);
    expect(screen.getByTestId('scene-wrong-bar')).toHaveTextContent('Look at the label');
    expect(screen.getByTestId('scene-wrong-hint')).toHaveTextContent('Look at the label');
  });

  it('renders no bar without a text', () => {
    render(<WrongHint text={null} />);
    expect(screen.queryByTestId('scene-wrong-bar')).toBeNull();
    expect(screen.getByTestId('scene-wrong-hint')).toBeInTheDocument();
  });

  it('hides the bar on try again and shows it for a new text', async () => {
    const { rerender } = render(<WrongHint text="first" />);
    fireEvent.click(screen.getByTestId('scene-try-again'));
    expect(await screen.findByTestId('scene-wrong-hint')).toHaveTextContent('first');
    await expect.poll(() => screen.queryByTestId('scene-wrong-bar')).toBeNull();
    rerender(<WrongHint text="second" />);
    expect(screen.getByTestId('scene-wrong-bar')).toHaveTextContent('second');
  });

  it('shows the same text again after the caller cleared it, or when the nonce changes', async () => {
    const { rerender } = render(<WrongHint text="same" />);
    fireEvent.click(screen.getByTestId('scene-try-again'));
    await expect.poll(() => screen.queryByTestId('scene-wrong-bar')).toBeNull();
    rerender(<WrongHint text={null} />);
    rerender(<WrongHint text="same" />);
    expect(screen.getByTestId('scene-wrong-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('scene-try-again'));
    await expect.poll(() => screen.queryByTestId('scene-wrong-bar')).toBeNull();
    rerender(<WrongHint text="same" nonce={1} />);
    expect(screen.getByTestId('scene-wrong-bar')).toBeInTheDocument();
  });

  it('dismisses on Escape', async () => {
    render(<WrongHint text="x" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    await expect.poll(() => screen.queryByTestId('scene-wrong-bar')).toBeNull();
  });
});

describe('WrongHint tone', () => {
  it('defaults to the miss tone', () => {
    render(<WrongHint text="x" />);
    expect(screen.getByTestId('scene-wrong-bar')).toHaveAttribute('data-tone', 'miss');
    expect(screen.getByTestId('scene-try-again')).toHaveTextContent('Tentar de novo');
  });

  it('renders the hit tone with its own title and button', () => {
    render(<WrongHint text="Found it" tone="hit" />);
    const bar = screen.getByTestId('scene-wrong-bar');
    expect(bar).toHaveAttribute('data-tone', 'hit');
    expect(bar).toHaveTextContent('Boa!');
    expect(screen.getByTestId('scene-try-again')).toHaveTextContent('Entendi');
  });

  it('moves focus to the button and gives it back on dismiss', async () => {
    render(<button data-testid="origin">origin</button>);
    screen.getByTestId('origin').focus();
    const { rerender } = render(<WrongHint text={null} />);
    rerender(<WrongHint text="x" />);
    expect(screen.getByTestId('scene-try-again')).toHaveFocus();
    fireEvent.click(screen.getByTestId('scene-try-again'));
    await expect.poll(() => document.activeElement).toBe(screen.getByTestId('origin'));
  });
});

describe('useWrongHint', () => {
  it('shows the bar again when the same text is shown again after Try again', async () => {
    function Host() {
      const { showHint, hintProps } = useWrongHint();
      return (
        <>
          <button data-testid="miss" onClick={() => showHint('same miss')} />
          <WrongHint {...hintProps} />
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByTestId('miss'));
    expect(screen.getByTestId('scene-wrong-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('scene-try-again'));
    await expect.poll(() => screen.queryByTestId('scene-wrong-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('miss'));
    expect(screen.getByTestId('scene-wrong-bar')).toHaveTextContent('same miss');
  });
});
