import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { LiveClassSignal } from './LiveClassSignal';

const mocks = vi.hoisted(() => ({ surface: 'web' as ShellSurface, toast: vi.fn() }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => mocks.surface }));
vi.mock('@/hooks/useLiveClass', () => ({ useActiveLiveClass: () => ({ data: { id: 'session-1' } }) }));
vi.mock('@/components/ui/sonner', () => ({ toast: mocks.toast }));

function mount() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <LiveClassSignal />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('LiveClassSignal', () => {
  beforeEach(() => {
    mocks.surface = 'web';
    mocks.toast.mockClear();
  });

  it('in a browser tab the toast carries the Enter action', () => {
    mount();
    expect(mocks.toast).toHaveBeenCalledOnce();
    const [, options] = mocks.toast.mock.calls[0];
    expect(options.action).toEqual(expect.objectContaining({ onClick: expect.any(Function) }));
  });

  it('inside the shell the toast says it is not available and has no action', () => {
    mocks.surface = 'shell';
    mount();
    expect(mocks.toast).toHaveBeenCalledOnce();
    const [, options] = mocks.toast.mock.calls[0];
    expect(options.description).toContain(window.location.host);
    expect(options.action).toBeUndefined();
  });

  it('while the handshake is pending it does not toast, and toasts once it settles', () => {
    mocks.surface = 'pending';
    const view = mount();
    expect(mocks.toast).not.toHaveBeenCalled();
    mocks.surface = 'shell';
    view.rerender(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <LiveClassSignal />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(mocks.toast).toHaveBeenCalledOnce();
  });
});
