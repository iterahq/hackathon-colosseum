import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByTestId('feedback-footer-explanation').textContent).toBe('Porque sim.');
    expect(screen.getByTestId('feedback-footer-continue')).toBeTruthy();
  });

  it('labels the explanation under the title, with the single Tera face', () => {
    renderFooter();
    const label = screen.getByTestId('feedback-footer-explanation-title');
    expect(label.textContent).toBe('Entenda o porquê');
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
