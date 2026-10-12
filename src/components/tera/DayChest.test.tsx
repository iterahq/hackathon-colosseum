import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_MINTED, WIRE_CHEST_ROLLING } from '@/services/teraChestMock';
import type { ChestPhase } from '@/utils/dayChest';
import { DayChest } from './DayChest';

vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));

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
    expect(screen.getByTestId('day-chest-tier')).toHaveTextContent('Super Tera · baú do dia 3');
    expect(screen.getByTestId('day-chest')).toHaveTextContent('não se compra nem se vende');
    expect(screen.getByTestId('day-chest-verify')).toHaveAttribute('href', '/verify?chest=chest_fixture_1#chest');
    expect(screen.getByTestId('day-chest-tera')).toHaveAttribute('src', expect.stringContaining('base_lider_128.webp'));
  });

  it('a chest found again is drawn settled, in the same row', () => {
    show('revealed', WIRE_CHEST_MINTED, true);
    expect(screen.getByTestId('day-chest-verify')).toBeInTheDocument();
  });
});
