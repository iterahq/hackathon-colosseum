import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import NotFoundRoute from './NotFoundRoute';

// `src/main.tsx` puts `dark` on <html> before any lazy chunk loads.
vi.hoisted(() => document.documentElement.classList.add('dark'));

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <NotFoundRoute />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('NotFoundRoute (web host of the universal not-found screen)', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.setItem('itera.locale', 'pt');
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    error.mockRestore();
    localStorage.clear();
  });

  it('renders the DOM of the page it replaced: one h1, one paragraph, one plain link home', () => {
    renderAt('/there-is-no-such-route');

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.tagName).toBe('H1');
    expect(heading).toHaveTextContent('404');

    const message = screen.getByText('Ops! Página não encontrada');
    expect(message.tagName).toBe('P');

    const link = screen.getByRole('link', { name: 'Voltar para o início' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('keeps the classes of the old page on the elements that had them', () => {
    const { container } = renderAt('/x');
    const root = container.firstElementChild as HTMLElement;
    for (const cls of ['flex', 'min-h-screen', 'items-center', 'justify-center', 'bg-muted']) expect(root).toHaveClass(cls);
    for (const cls of ['mb-4', 'text-4xl', 'font-bold']) expect(screen.getByRole('heading')).toHaveClass(cls);
    for (const cls of ['text-primary', 'underline', 'hover:text-primary/90']) expect(screen.getByRole('link')).toHaveClass(cls);
  });

  it('logs the line monitoring reads, with the path, once per path', () => {
    renderAt('/missing/page');
    const lines = error.mock.calls.filter((c) => String(c[0]).startsWith('404 Error'));
    expect(lines).toEqual([['404 Error: User attempted to access non-existent route:', '/missing/page']]);
  });

  it('leaves the class list of <html> as the app set it (Uniwind adopts the class it finds)', () => {
    renderAt('/x');
    expect([...document.documentElement.classList]).toEqual(['dark']);
  });

  it('injects no document-wide rule: the react-native-web reset is edited out of the build', () => {
    const { container } = renderAt('/x');
    expect(container.firstElementChild?.className).toMatch(/\bcss-/);
    const sheet = (document.getElementById('react-native-stylesheet') as HTMLStyleElement).sheet as CSSStyleSheet;
    const rules = [...sheet.cssRules].map((r) => r.cssText);
    expect(rules.filter((r) => /^(html|body|button|input)\b/.test(r))).toEqual([]);
  });
});
