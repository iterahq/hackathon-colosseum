import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { RouteErrorBoundary } from './RouteErrorBoundary';

let broken = true;
function Bomb() {
  if (broken) throw new Error('boom');
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
});
