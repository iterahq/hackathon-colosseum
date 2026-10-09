import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { FeedbackFooter } from './FeedbackFooter';

function renderFooter(props: Partial<React.ComponentProps<typeof FeedbackFooter>> = {}) {
  return render(
    <I18nProvider>
      <FeedbackFooter
        result={{ correct: true, message: 'Boa!', explanation: 'Porque sim.' }}
        onContinue={() => {}}
        {...props}
      />
    </I18nProvider>
  );
}

describe('FeedbackFooter', () => {
  it('keeps the title and explanation test ids', () => {
    renderFooter();
    expect(screen.getByTestId('feedback-footer').getAttribute('data-correct')).toBe('true');
    expect(screen.getByTestId('feedback-footer-title').textContent).toBe('Boa!');
    fireEvent.click(screen.getByTestId('feedback-footer-explanation-title'));
    expect(screen.getByTestId('feedback-footer-explanation').textContent).toBe('Porque sim.');
    expect(screen.getByTestId('feedback-footer-continue')).toBeTruthy();
  });

  it('labels the explanation under the title, with the single Tera face', () => {
    renderFooter();
    const label = screen.getByTestId('feedback-footer-explanation-title');
    expect(label.textContent).toBe('Entenda o porquê');
    fireEvent.click(label);
    expect(label.compareDocumentPosition(screen.getByTestId('feedback-footer-explanation'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(document.querySelectorAll('[data-tera]')).toHaveLength(1);
  });

  it('shows no label when there is no explanation', () => {
    renderFooter({ result: { correct: false } });
    expect(screen.queryByTestId('feedback-footer-explanation-title')).toBeNull();
  });

  it('pads the footer by the safe-area insets and falls back to 0px', () => {
    renderFooter();
    const inner = screen.getByTestId('feedback-footer').firstElementChild as HTMLElement;
    expect(inner.className).toContain('pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]');
    expect(inner.className).toContain('pl-[max(1rem,env(safe-area-inset-left,0px))]');
    expect(inner.className).toContain('pr-[max(1rem,env(safe-area-inset-right,0px))]');
    expect(inner.className).toContain('md:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]');
  });

  it('continues on Enter', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('ignores a held-down Enter', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('ignores Enter typed into an input', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    input.remove();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not listen while busy, hidden or without a continue handler', () => {
    const onContinue = vi.fn();
    const { unmount } = renderFooter({ onContinue, busy: true });
    fireEvent.keyDown(window, { key: 'Enter' });
    unmount();
    renderFooter({ onContinue, result: null });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('leaves Enter on a focused foreign button alone', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    const other = document.createElement('button');
    document.body.appendChild(other);
    const notPrevented = fireEvent.keyDown(other, { key: 'Enter' });
    other.remove();
    expect(onContinue).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('continues on Enter from the body and prevents the default', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    const notPrevented = fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it('continues once on Enter from its own continue button', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    fireEvent.keyDown(screen.getByTestId('feedback-footer-continue'), { key: 'Enter' });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('ignores an Enter another handler already prevented', () => {
    const onContinue = vi.fn();
    renderFooter({ onContinue });
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    event.preventDefault();
    document.body.dispatchEvent(event);
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe('FeedbackFooter retry', () => {
  it('offers Tentar de novo beside Continuar after a miss', () => {
    renderFooter({ result: { correct: false }, onRetry: () => {} });
    expect(screen.getByTestId('feedback-footer-retry').textContent).toBe('Tentar de novo');
    expect(screen.getByTestId('feedback-footer-continue').textContent).toBe('Continuar');
  });

  it('never offers it after a correct answer', () => {
    renderFooter({ result: { correct: true }, onRetry: () => {} });
    expect(screen.queryByTestId('feedback-footer-retry')).toBeNull();
  });

  it('shows no retry button when none is wired (live class, harness)', () => {
    renderFooter({ result: { correct: false } });
    expect(screen.queryByTestId('feedback-footer-retry')).toBeNull();
  });

  it('runs retry, not continue, from the buttons', () => {
    const onRetry = vi.fn();
    const onContinue = vi.fn();
    renderFooter({ result: { correct: false }, onRetry, onContinue });
    fireEvent.click(screen.getByTestId('feedback-footer-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('feedback-footer-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('makes Enter trigger the primary action, which is retry on a miss', () => {
    const onRetry = vi.fn();
    const onContinue = vi.fn();
    renderFooter({ result: { correct: false }, onRetry, onContinue });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('keeps both buttons at 48px height', () => {
    renderFooter({ result: { correct: false }, onRetry: () => {} });
    for (const id of ['feedback-footer-retry', 'feedback-footer-continue']) {
      expect(screen.getByTestId(id).className).toContain('h-12');
    }
  });
});

describe('FeedbackFooter explanation disclosure', () => {
  const miss = { correct: false, message: 'Quase', explanation: 'Porque sim.' };

  it('starts collapsed on a miss, with a real button wired by aria', () => {
    renderFooter({ result: miss, onRetry: () => {} });
    const button = screen.getByTestId('feedback-footer-explanation-title');
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toContain('Entenda o porquê');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('feedback-footer-explanation')).toBeNull();
  });

  it('expands and collapses on click', async () => {
    renderFooter({ result: miss, onRetry: () => {} });
    const button = screen.getByTestId('feedback-footer-explanation-title');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBeTruthy();
    expect(screen.getByTestId('feedback-footer-explanation').textContent).toBe('Porque sim.');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(screen.queryByTestId('feedback-footer-explanation')).toBeNull());
  });

  it('renders no button without explanation text', () => {
    renderFooter({ result: { correct: false, message: 'Quase' }, onRetry: () => {} });
    expect(screen.queryByTestId('feedback-footer-explanation-title')).toBeNull();
  });

  it('collapses again for the next miss', () => {
    const { rerender } = renderFooter({ result: miss, onRetry: () => {} });
    fireEvent.click(screen.getByTestId('feedback-footer-explanation-title'));
    expect(screen.getByTestId('feedback-footer-explanation')).toBeTruthy();
    rerender(
      <I18nProvider>
        <FeedbackFooter result={{ ...miss }} onContinue={() => {}} onRetry={() => {}} />
      </I18nProvider>
    );
    expect(screen.getByTestId('feedback-footer-explanation-title').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('feedback-footer-explanation')).toBeNull();
  });

  it('keeps retry primary and Enter on retry while it is open', () => {
    const onRetry = vi.fn();
    const onContinue = vi.fn();
    renderFooter({ result: miss, onRetry, onContinue });
    fireEvent.click(screen.getByTestId('feedback-footer-explanation-title'));
    expect(onRetry).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByTestId('feedback-footer-retry').className).toContain('bg-destructive');
  });

  it('leaves Enter on the focused disclosure to the button itself', () => {
    const onRetry = vi.fn();
    renderFooter({ result: miss, onRetry, onContinue: () => {} });
    fireEvent.keyDown(screen.getByTestId('feedback-footer-explanation-title'), { key: 'Enter' });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('gives the button a 44px mobile touch target and bounds the text', () => {
    renderFooter({ result: miss, onRetry: () => {} });
    const button = screen.getByTestId('feedback-footer-explanation-title');
    expect(button.className).toContain('min-h-11');
    fireEvent.click(button);
    expect(screen.getByTestId('feedback-footer-explanation').className).toContain('max-h-[32vh]');
  });
});
