import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { ShellLiveUnavailableRoute } from './ShellLiveUnavailableRoute';

const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="root-guards">ROOT</div>} />
          {['/live/instructor', '/live/:sessionId'].map((p) => (
            <Route
              key={p}
              path={p}
              element={
                <ShellLiveUnavailableRoute>
                  <div data-testid="live-page">Live</div>
                </ShellLiveUnavailableRoute>
              }
            />
          ))}
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('ShellLiveUnavailableRoute', () => {
  beforeEach(() => {
    surface.value = 'web';
  });

  it.each(['/live/instructor', '/live/abc'])('in a browser tab %s renders its page', (path) => {
    renderAt(path);
    expect(screen.getByTestId('live-page')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-live-unavailable')).not.toBeInTheDocument();
  });

  it.each(['/live/instructor', '/live/abc'])('inside the shell %s shows the notice and stays on the route', (path) => {
    surface.value = 'shell';
    renderAt(path);
    expect(screen.getByTestId('shell-live-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('live-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('root-guards')).not.toBeInTheDocument();
  });

  it('while the handshake is pending it shows neither the page nor the notice', () => {
    surface.value = 'pending';
    renderAt('/live/abc');
    expect(screen.getByTestId('shell-settling')).toBeInTheDocument();
    expect(screen.queryByTestId('live-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell-live-unavailable')).not.toBeInTheDocument();
  });
});
