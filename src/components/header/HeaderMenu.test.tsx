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
  it('leaves the World and the Shop to the tabs on the focus build', () => {
    mount('en');
    expect(screen.queryByTestId('header-menu-world')).toBeNull();
    expect(screen.queryByTestId('header-menu-shop')).toBeNull();
    expect(screen.getByRole('group', { name: 'Help' })).toBeInTheDocument();
  });

  it('sends an account with no wallet to Certifications to link one', () => {
    const onClose = mount('en');
    const link = screen.getByTestId('header-menu-link-wallet');
    expect(link).toHaveAttribute('href', '/certifications');
    link.click();
    expect(onClose).toHaveBeenCalled();
  });
});
