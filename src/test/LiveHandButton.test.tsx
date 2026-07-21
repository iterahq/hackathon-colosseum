import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveHandButton } from '@/components/live/LiveHandButton';

function renderButton(raised: boolean, onToggle = vi.fn()) {
  render(
    <I18nProvider>
      <LiveHandButton raised={raised} onToggle={onToggle} />
    </I18nProvider>
  );
  return onToggle;
}

describe('LiveHandButton', () => {
  it('offers to raise the hand when lowered and fires the toggle', () => {
    const onToggle = renderButton(false);
    const btn = screen.getByTestId('live-hand-btn');
    expect(btn.getAttribute('data-raised')).toBe('false');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn).toHaveTextContent('Levantar a mão');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('offers to lower the hand while raised', () => {
    renderButton(true);
    const btn = screen.getByTestId('live-hand-btn');
    expect(btn.getAttribute('data-raised')).toBe('true');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn).toHaveTextContent('Baixar a mão');
  });
});
