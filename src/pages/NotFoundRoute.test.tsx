import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('shows Tera looking everywhere, with one plain link back to the start', () => {
    const { container } = renderAt('/there-is-no-such-route');
    expect(screen.getByText('O Tera procurou em todo lugar e não achou essa página.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-tera="oops"]')).toHaveLength(1);
    const link = screen.getByRole('link', { name: 'Voltar para o início' });
    expect(link).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('speaks english when the locale is en', () => {
    renderAt('/x', 'en');
    expect(screen.getByText("Tera looked everywhere and couldn't find this page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the start' })).toBeInTheDocument();
  });

  it('logs the line monitoring reads, with the path, once per path', () => {
    renderAt('/missing/page');
    const lines = error.mock.calls.filter((c) => String(c[0]).startsWith('404 Error'));
    expect(lines).toEqual([['404 Error: User attempted to access non-existent route:', '/missing/page']]);
  });

  describe('in a tab older than the deployed build', () => {
    const page = (name: string) => new Response(`<script type="module" src="/assets/${name}"></script>`, { status: 200 });

    beforeEach(() => {
      document.head.innerHTML = '<script type="module" src="/assets/index-OLD.js"></script>';
    });

    afterEach(() => {
      document.head.innerHTML = '';
      sessionStorage.clear();
      vi.unstubAllGlobals();
    });

    function renderStale(reload: () => void) {
      localStorage.setItem('itera.locale', 'pt');
      return render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/bounties']}>
            <NotFoundRoute reload={reload} />
          </MemoryRouter>
        </I18nProvider>,
      );
    }

    it('reloads behind the loader instead of saying "not found" when a newer build exists', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => page('index-NEW.js')));
      const reload = vi.fn();
      renderStale(reload);
      expect(screen.queryByTestId('not-found')).not.toBeInTheDocument();
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('not-found')).not.toBeInTheDocument();
      expect(error.mock.calls.filter((c) => String(c[0]).startsWith('404 Error'))).toEqual([]);
    });

    it('says "not found" once the build is confirmed current', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => page('index-OLD.js')));
      const reload = vi.fn();
      renderStale(reload);
      expect(await screen.findByTestId('not-found')).toBeInTheDocument();
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
