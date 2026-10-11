import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { RouteErrorBoundary, isStaleChunkError } from './RouteErrorBoundary';

let broken = true;
let message = 'boom';
function Bomb() {
  if (broken) throw new Error(message);
  return <p>fine</p>;
}

describe('RouteErrorBoundary', () => {
  it('shows Tera with a retry, and the retry renders the route again', () => {
    localStorage.setItem('itera.locale', 'pt');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    broken = true;
    render(
      <I18nProvider>
        <MemoryRouter>
          <RouteErrorBoundary>
            <Bomb />
          </RouteErrorBoundary>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId('route-error')).toHaveTextContent('Algo quebrou aqui. O Tera já foi avisado.');
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByText('fine')).toBeInTheDocument();
    error.mockRestore();
    localStorage.clear();
  });

  it('reloads once when the failure is a chunk left behind by a deploy', () => {
    localStorage.setItem('itera.locale', 'pt');
    sessionStorage.clear();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    broken = true;
    message = "Cannot read properties of undefined (reading 'default')";
    const ui = (
      <I18nProvider>
        <MemoryRouter initialEntries={['/lesson/abc']}>
          <RouteErrorBoundary reload={reload}>
            <Bomb />
          </RouteErrorBoundary>
        </MemoryRouter>
      </I18nProvider>
    );
    const first = render(ui);
    expect(reload).toHaveBeenCalledTimes(1);
    first.unmount();
    render(ui);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('route-error')).toBeInTheDocument();
    message = 'boom';
    error.mockRestore();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('recognises the shapes a stale chunk takes across browsers', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
    expect(isStaleChunkError(new Error('boom'))).toBe(false);
  });
});
