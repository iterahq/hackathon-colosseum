import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FOCUS_HEADER_NAV, FULL_HEADER_NAV, HEADER_NAV } from '@/consts/headerNav';
import { I18nProvider } from '@/i18n';
import { HeaderTabBar } from './HeaderTabBar';

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

describe('HEADER_NAV', () => {
  it('puts Verify in the signed-in nav and keeps Files in the account menu', () => {
    expect(FULL_HEADER_NAV.map((n) => n.id)).toEqual(['trails', 'courses', 'passport', 'shop', 'bounties', 'verify']);
    expect(HEADER_NAV.find((n) => n.id === 'verify')?.to).toBe('/verify');
  });
  it('shows the four tabs of the loop on the focus build, the courses and the shop left out', () => {
    expect(FOCUS_HEADER_NAV.map((n) => n.id)).toEqual(['trails', 'passport', 'bounties', 'verify']);
    expect(HEADER_NAV).toBe(FOCUS_HEADER_NAV);
  });
});
