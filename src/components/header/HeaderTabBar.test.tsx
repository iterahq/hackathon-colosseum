import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FOCUS_HEADER_NAV, FULL_HEADER_NAV, HEADER_NAV } from '@/consts/headerNav';
import { I18nProvider } from '@/i18n';
import { HeaderTabBar } from './HeaderTabBar';

const openInvites = vi.fn(() => 0);
vi.mock('@/hooks/useInvites', () => ({ useOpenInviteCount: () => openInvites() }));

describe('HeaderTabBar', () => {
  it('gives every nav entry its own column, so a sixth entry never wraps to a second row', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <HeaderTabBar active="bounties" />
        </MemoryRouter>
      </I18nProvider>,
    );
    const list = screen.getByTestId('header-tab-bar').querySelector('ul')!;
    expect(list.style.gridTemplateColumns).toBe(`repeat(${HEADER_NAV.length}, minmax(0, 1fr))`);
    expect(list.querySelectorAll('li')).toHaveLength(HEADER_NAV.length);
    expect(screen.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/bounties');
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
  it('shows the count on the Bounties tab only', () => {
    openInvites.mockReturnValue(2);
    show();
    const badge = screen.getByTestId('invite-badge');
    expect(badge).toHaveTextContent('2');
    expect(badge).toHaveAccessibleName('Missões enviadas para você: 2');
    expect(badge.closest('a')).toHaveAttribute('href', '/bounties');
    expect(screen.getAllByTestId('invite-badge')).toHaveLength(1);
  });
});

describe('HEADER_NAV', () => {
  it('puts Verify in the signed-in nav and keeps Files in the account menu', () => {
    expect(FULL_HEADER_NAV.map((n) => n.id)).toEqual(['trails', 'courses', 'passport', 'shop', 'bounties', 'verify']);
    expect(HEADER_NAV.find((n) => n.id === 'verify')?.to).toBe('/verify');
  });
  it('points the Talent tab at the public board', () => {
    expect(FOCUS_HEADER_NAV.find((n) => n.id === 'talent')?.to).toBe('/talent');
  });
  it('shows the five tabs of the loop on the focus build, the courses and the shop left out', () => {
    expect(FOCUS_HEADER_NAV.map((n) => n.id)).toEqual(['trails', 'passport', 'bounties', 'talent', 'verify']);
    expect(HEADER_NAV).toBe(FOCUS_HEADER_NAV);
  });
});
