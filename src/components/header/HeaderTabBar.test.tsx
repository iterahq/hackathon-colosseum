import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FOCUS_HEADER_NAV, FULL_HEADER_NAV, HEADER_NAV } from '@/consts/headerNav';
import { I18nProvider } from '@/i18n';
import { HeaderTabBar } from './HeaderTabBar';

const openInvites = vi.fn(() => 0);
vi.mock('@/hooks/useInvites', () => ({ useOpenInviteCount: () => openInvites() }));

describe('HeaderTabBar', () => {
  it('gives every nav entry its own column, so no entry wraps to a second row', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <HeaderTabBar active="shop" />
        </MemoryRouter>
      </I18nProvider>,
    );
    const list = screen.getByTestId('header-tab-bar').querySelector('ul')!;
    expect(list.style.gridTemplateColumns).toBe(`repeat(${HEADER_NAV.length}, minmax(0, 1fr))`);
    expect(list.querySelectorAll('li')).toHaveLength(HEADER_NAV.length);
    expect(screen.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/shop');
  });

  it('walks the demo in order: Trails, Certifications, World, Shop', () => {
    localStorage.setItem('itera.locale', 'en');
    render(
      <I18nProvider>
        <MemoryRouter>
          <HeaderTabBar active="trails" />
        </MemoryRouter>
      </I18nProvider>,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/certifications', '/world', '/shop']);
    expect(links.map((a) => a.textContent)).toEqual(['Trails', 'Certs', 'World', 'Shop']);
    localStorage.removeItem('itera.locale');
  });
});

describe('invite badge', () => {
  const show = () =>
    render(
      <I18nProvider>
        <MemoryRouter>
          <HeaderTabBar active="trails" />
        </MemoryRouter>
      </I18nProvider>,
    );
  it('draws nothing without an open invite', () => {
    openInvites.mockReturnValue(0);
    show();
    expect(screen.queryByTestId('invite-badge')).toBeNull();
  });
  it('draws nothing with open invites either: Bounties is not a tab on the focus build', () => {
    openInvites.mockReturnValue(2);
    show();
    expect(screen.queryByTestId('invite-badge')).toBeNull();
    expect(screen.queryByRole('link', { name: /Miss|Bount/ })).toBeNull();
  });
});

describe('HEADER_NAV', () => {
  it('keeps Verify in the full nav and Files in the account menu', () => {
    expect(FULL_HEADER_NAV.map((n) => n.id)).toEqual(['trails', 'courses', 'passport', 'shop', 'bounties', 'verify']);
    expect(FULL_HEADER_NAV.find((n) => n.id === 'verify')?.to).toBe('/verify');
  });
  it('shows the four tabs of the demo on the focus build, World before Shop', () => {
    expect(FOCUS_HEADER_NAV.map((n) => n.id)).toEqual(['trails', 'passport', 'world', 'shop']);
    expect(FOCUS_HEADER_NAV.map((n) => n.to)).toEqual(['/', '/certifications', '/world', '/shop']);
    expect(HEADER_NAV).toBe(FOCUS_HEADER_NAV);
  });
  it('hides Talent, Bounties and Verify from the tabs', () => {
    for (const id of ['talent', 'bounties', 'verify']) expect(FOCUS_HEADER_NAV.find((n) => n.id === id)).toBeUndefined();
  });
});
