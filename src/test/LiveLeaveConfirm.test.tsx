import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveLeaveConfirm } from '@/components/live/LiveLeaveConfirm';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';

function renderConfirm() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <I18nProvider>
      <LiveLeaveConfirm onConfirm={onConfirm} onCancel={onCancel} />
    </I18nProvider>
  );
  return { onConfirm, onCancel };
}

describe('LiveLeaveConfirm', () => {
  it('starts focused on staying, so a reflex Enter never leaves the class', () => {
    renderConfirm();
    expect(screen.getByTestId('live-leave-confirm')).toHaveTextContent('Sair da aula?');
    expect(document.activeElement).toBe(screen.getByTestId('live-leave-stay'));
  });

  it('leaves only on the explicit confirm', () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByTestId('live-leave-stay'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('live-leave-yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape', () => {
    const { onCancel, onConfirm } = renderConfirm();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('LiveSessionChrome close confirmation', () => {
  it('renders the confirmation anchored under the close button', () => {
    render(
      <I18nProvider>
        <LiveSessionChrome
          progressPct={40}
          ended={false}
          onClose={() => {}}
          closeConfirm={<LiveLeaveConfirm onConfirm={() => {}} onCancel={() => {}} />}
        />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-close')).toBeTruthy();
    expect(screen.getByTestId('live-leave-confirm')).toBeTruthy();
  });

  it('has no confirmation by default', () => {
    render(
      <I18nProvider>
        <LiveSessionChrome progressPct={0} ended={false} onClose={() => {}} />
      </I18nProvider>
    );
    expect(screen.queryByTestId('live-leave-confirm')).toBeNull();
  });
});

describe('LiveSessionChrome layout (Tainan 2026-08-06)', () => {
  const renderChrome = (props: Partial<Parameters<typeof LiveSessionChrome>[0]> = {}) =>
    render(
      <I18nProvider>
        <LiveSessionChrome
          progressPct={20}
          ended={false}
          activityIndex={2}
          activityCount={9}
          timerSlot={<span data-testid="slot-timer" />}
          handSlot={<span data-testid="slot-hand" />}
          onClose={() => {}}
          {...props}
        />
      </I18nProvider>
    );

  it('puts timer and hand on the right, not in the centre', () => {
    renderChrome();
    const right = screen.getByTestId('live-chrome-right');
    expect(right.className).toContain('right-3');
    expect(right).toContainElement(screen.getByTestId('slot-timer'));
    expect(right).toContainElement(screen.getByTestId('slot-hand'));
    expect(screen.getByTestId('live-indicator')).not.toContainElement(screen.getByTestId('slot-timer'));
  });

  it('no longer paints the redundant LIVE pill with presence and N/M', () => {
    renderChrome();
    // A posição segue legível por atributo (analytics/E2E), sem ocupar a tela.
    const indicator = screen.getByTestId('live-indicator');
    expect(indicator).toHaveAttribute('data-activity-index', '3');
    expect(indicator).toHaveAttribute('data-activity-count', '9');
    expect(indicator).toHaveTextContent('');
    expect(screen.queryByTestId('live-position-chrome')).toBeNull();
  });

  it('keeps the ended indicator and drops the timer once the class ends', () => {
    renderChrome({ ended: true });
    expect(screen.getByTestId('live-indicator-ended')).toBeTruthy();
    expect(screen.queryByTestId('live-chrome-right')).toBeNull();
  });
});
