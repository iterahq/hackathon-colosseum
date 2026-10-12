import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_MINTED, WIRE_CHEST_ROLLING } from '@/services/teraChestMock';
import type { ChestPhase } from '@/utils/dayChest';
import { DayChest } from './DayChest';

const play = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play }) }));
vi.mock('@/hooks/useTeraCatalog', async () => {
  const { FALLBACK_CATALOG } = await import('@/services/teraCatalog.service');
  return { useTeraCatalog: () => FALLBACK_CATALOG };
});

const show = (phase: ChestPhase, wire: unknown, still = false) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <DayChest phase={phase} chest={wire ? toChest(wire) : null} day={3} still={still} />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('DayChest', () => {
  it('sealing: a closed chest and no link yet', () => {
    show('sealing', null);
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-phase', 'sealing');
    expect(screen.getByTestId('chest-art')).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('committed: says the result is not known yet and links the commitment transaction', () => {
    show('committed', WIRE_CHEST_COMMITTED);
    expect(screen.getByTestId('day-chest-line')).toHaveTextContent('Lacrado na Solana');
    expect(screen.getByTestId('day-chest-commit')).toHaveAttribute('href', expect.stringContaining('/tx/5fixtureCommitSignature'));
    expect(screen.getByTestId('day-chest-commit')).toHaveTextContent('418220113');
  });

  it('rolling: the block arrived', () => {
    show('rolling', WIRE_CHEST_ROLLING);
    expect(screen.getByTestId('day-chest-line')).toHaveTextContent('O bloco chegou');
  });

  it('revealed: the Tera, its tier, that it was earned and cannot be transferred, and the link to roll it again', () => {
    show('revealed', WIRE_CHEST_MINTED);
    expect(screen.getByTestId('day-chest-name')).toHaveTextContent('Tera, leader');
    expect(screen.getByTestId('day-chest-tier')).toHaveTextContent('Super Tera');
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-rarity', 'rare');
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-earn-only', 'false');
    expect(screen.queryByTestId('day-chest-earn-only')).not.toBeInTheDocument();
    expect(screen.getByTestId('day-chest-yours')).toHaveTextContent('Só seu: não se compra nem se vende.');
    expect(screen.getByTestId('day-chest-verify')).toHaveAttribute('href', '/verify?chest=chest_fixture_1#chest');
    expect(screen.getByTestId('day-chest-tera')).toHaveAttribute('src', expect.stringContaining('base_lider_128.webp'));
  });

  it('a chest found again is drawn settled, in the same row', () => {
    show('revealed', WIRE_CHEST_MINTED, true);
    expect(screen.getByTestId('day-chest-verify')).toBeInTheDocument();
  });

  it('a tier that is never for sale looks unmistakably different: its own chip, frame and sound', () => {
    play.mockClear();
    localStorage.clear();
    show('revealed', { ...WIRE_CHEST_MINTED, tier: 'legendary', tera: { ...WIRE_CHEST_MINTED.tera, rarity: 'legendary', tier_name: 'Tera Lendário' } });
    const card = screen.getByTestId('day-chest');
    expect(card).toHaveAttribute('data-earn-only', 'true');
    expect(card.className).toContain('border-2');
    expect(screen.getByTestId('day-chest-earn-only')).toHaveTextContent('Só se ganha');
    expect(screen.getByTestId('day-chest-tier')).toHaveTextContent('Tera Lendário');
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
    expect(play).toHaveBeenCalledWith('celebration', 0.5);
  });

  it('a common Tera opens quietly, and an opened chest is remembered as seen', () => {
    play.mockClear();
    localStorage.clear();
    show('revealed', { ...WIRE_CHEST_MINTED, tier: 'common', tera: { ...WIRE_CHEST_MINTED.tera, rarity: 'common', tier_name: 'Tera' } });
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
    expect(play).toHaveBeenCalledWith('success', 0.35);
    expect(JSON.parse(localStorage.getItem('itera.chest.seen.v1') ?? '[]')).toEqual(['chest_fixture_1']);
  });

  it('a tap ends the motion at once; a chest found again plays none and no sound', () => {
    play.mockClear();
    const first = show('revealed', WIRE_CHEST_MINTED);
    expect(screen.getByTestId('day-chest-flash')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('day-chest'));
    expect(screen.queryByTestId('day-chest-flash')).not.toBeInTheDocument();
    first.unmount();
    play.mockClear();
    show('revealed', WIRE_CHEST_MINTED, true);
    expect(screen.queryByTestId('day-chest-flash')).not.toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
  });

  it('standing alone it is drawn larger, with the day it came from', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <DayChest phase="revealed" chest={toChest(WIRE_CHEST_MINTED)} day={3} size="hero" />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-size', 'hero');
    expect(screen.getByTestId('day-chest-day')).toHaveTextContent('saiu do baú do dia 3');
    expect(screen.getByTestId('day-chest-tera')).toHaveAttribute('src', expect.stringContaining('base_lider.webp'));
  });
});
