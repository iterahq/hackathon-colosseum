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
          connected
          presenceCount={3}
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
        <LiveSessionChrome
          progressPct={0}
          connected={false}
          presenceCount={0}
          ended={false}
          onClose={() => {}}
        />
      </I18nProvider>
    );
    expect(screen.queryByTestId('live-leave-confirm')).toBeNull();
  });
});
