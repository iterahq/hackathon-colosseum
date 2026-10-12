import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { DayChestSlot } from './DayChestSlot';

vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));
vi.mock('@/hooks/useTeraCatalog', async () => {
  const { FALLBACK_CATALOG } = await import('@/services/teraCatalog.service');
  return { useTeraCatalog: () => FALLBACK_CATALOG };
});
vi.mock('@/hooks/useWalletLink', () => ({ useWalletLink: () => ({ wallet: 'QaWallet' }) }));
vi.mock('@/hooks/useDayChest', () => ({
  useMyChests: () => ({ enabled: true }),
  useDayChest: () => ({ phase: 'sealing', chest: null, justOpened: false, nothing: false, canOpen: false, opening: false, open: vi.fn() }),
}));

const show = (size?: 'row' | 'hero') => render(<I18nProvider><MemoryRouter><DayChestSlot lessonId="l1" day={1} active size={size} /></MemoryRouter></I18nProvider>);

describe('DayChestSlot size', () => {
  it('draws the row by default', () => {
    show();
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-size', 'row');
  });
  it('hands the hero size to the chest: the lesson end makes it the big thing on the screen', () => {
    show('hero');
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-size', 'hero');
  });
});
