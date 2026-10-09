import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import NotFoundRoute from './NotFoundRoute';

function renderAt(path: string, locale: 'pt' | 'en' = 'pt') {
  localStorage.setItem('itera.locale', locale);
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <NotFoundRoute />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('NotFoundRoute', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    error.mockRestore();
    localStorage.clear();
  });

  it('shows Tera looking everywhere, with one plain link back to the dashboard', () => {
    const { container } = renderAt('/there-is-no-such-route');
    expect(screen.getByText('O Tera procurou em todo lugar e não achou essa página.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-tera="oops"]')).toHaveLength(1);
    const link = screen.getByRole('link', { name: 'Voltar para o painel' });
    expect(link).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('speaks english when the locale is en', () => {
    renderAt('/x', 'en');
    expect(screen.getByText("Tera looked everywhere and couldn't find this page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toBeInTheDocument();
  });

  it('logs the line monitoring reads, with the path, once per path', () => {
    renderAt('/missing/page');
    const lines = error.mock.calls.filter((c) => String(c[0]).startsWith('404 Error'));
    expect(lines).toEqual([['404 Error: User attempted to access non-existent route:', '/missing/page']]);
  });
});
