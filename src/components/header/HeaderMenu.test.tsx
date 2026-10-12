import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { DEFAULT_AVATAR } from '@/types/avatar';
import { HeaderMenu } from './HeaderMenu';

function mount(locale: 'pt' | 'en', onClose = vi.fn()) {
  localStorage.setItem('itera.locale', locale);
  render(
    <I18nProvider>
      <MemoryRouter>
        <HeaderMenu name="Ana" avatar={DEFAULT_AVATAR} email="ana@example.com" wallet={null} roles={{ admin: false, canStartLiveClass: false } as never} onClose={onClose} onExplainer={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return onClose;
}

describe('HeaderMenu', () => {
  it("links to Tera's World from the help group, in English", () => {
    const onClose = mount('en');
    const link = screen.getByTestId('header-menu-world');
    expect(link).toHaveAttribute('href', '/world');
    expect(link).toHaveTextContent("Tera's World");
    expect(link.closest('[role="group"]')).toHaveAttribute('aria-label', 'Help');
    link.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('says "Mundo do Tera" in Portuguese', () => {
    mount('pt');
    expect(screen.getByTestId('header-menu-world')).toHaveTextContent('Mundo do Tera');
  });
});
