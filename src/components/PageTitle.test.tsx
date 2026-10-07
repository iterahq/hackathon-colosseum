import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider, useI18n } from '@/i18n';
import { usePageTitle } from '@/hooks/usePageTitle';
import { pageName } from '@/lib/pageTitle';
import { PageTitle } from './PageTitle';

const SERVED = 'Itera | Microlearning com IA';

function Named({ name }: { name: string | undefined }) {
  usePageTitle(name);
  return null;
}

function LocaleButton() {
  const { setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale('en', false)}>
      english
    </button>
  );
}

function renderAt(path: string, lessonName: string | undefined = 'Dia 1: Seu primeiro HTML') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <PageTitle />
        <LocaleButton />
        <Link to="/catalog">catalog</Link>
        <Link to="/lesson/1">lesson</Link>
        <Link to="/live/9">live</Link>
        <Routes>
          <Route path="/lesson/:id" element={<Named name={lessonName} />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.title = SERVED;
});

afterEach(() => {
  act(() => pageName.set(null));
});

describe('PageTitle', () => {
  it('names a route with a fixed name, in the current language', async () => {
    renderAt('/catalog');
    expect(document.title).toBe('Catálogo de cursos | Itera');
    await userEvent.click(screen.getByText('english'));
    expect(document.title).toBe('Course catalog | Itera');
  });

  it('keeps the served title on a route with no name', () => {
    renderAt('/live/9');
    expect(document.title).toBe(SERVED);
  });

  it('lets a page name itself, and survives a language change', async () => {
    renderAt('/lesson/1');
    expect(document.title).toBe('Dia 1: Seu primeiro HTML | Itera');
    await userEvent.click(screen.getByText('english'));
    expect(document.title).toBe('Dia 1: Seu primeiro HTML | Itera');
  });

  it('keeps the served title while a page has no name yet', () => {
    renderAt('/lesson/1', '');
    expect(document.title).toBe(SERVED);
  });

  it('drops the name of a page that was left', async () => {
    renderAt('/lesson/1');
    await userEvent.click(screen.getByText('live'));
    expect(document.title).toBe(SERVED);
    await userEvent.click(screen.getByText('lesson'));
    expect(document.title).toBe('Dia 1: Seu primeiro HTML | Itera');
    await userEvent.click(screen.getByText('catalog'));
    expect(document.title).toBe('Catálogo de cursos | Itera');
  });
});
