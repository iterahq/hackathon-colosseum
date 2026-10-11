import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HEADER_NAV } from '@/consts/headerNav';
import { I18nProvider } from '@/i18n';
import { HeaderTabBar } from './HeaderTabBar';

describe('HeaderTabBar', () => {
  it('gives every nav entry its own column, so a sixth entry never wraps to a second row', () => {
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
});
