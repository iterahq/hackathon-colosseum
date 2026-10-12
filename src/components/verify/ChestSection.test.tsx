import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import sample from '@/lib/chain/chestSample.fixture.json';
import { toChest, toRecompute } from '@/services/teraChest.service';
import { ChestSection } from './ChestSection';

const mocks = vi.hoisted(() => ({ getChest: vi.fn(), recompute: vi.fn() }));
vi.mock('@/services/teraChest.service', async (actual) => ({ ...(await actual<typeof import('@/services/teraChest.service')>()), getChest: mocks.getChest }));
vi.mock('@/lib/chain/chestRecompute', () => ({ recomputeFromChain: mocks.recompute }));

const read = () => ({ chest: toChest(sample.chest)!, recompute: toRecompute(sample.recompute) });
const rolled = (key: string) => ({ ok: true, result: { commit: sample.chest.commit.value, targetSlot: sample.chest.commit.slot, level: sample.chest.level, commitTxSlot: sample.chest.commit.tx_slot, seedSlot: sample.chest.seed.slot, blockhash: sample.chest.seed.blockhash, seed: sample.chest.seed.value, tier: sample.chest.tier, key, steps: sample.recompute.steps, agrees: key === sample.chest.tera.key } });

function show(path = '/verify#chest') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <ChestSection />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('ChestSection', () => {
  beforeEach(() => {
    mocks.getChest.mockReset();
    mocks.recompute.mockReset();
  });

  it('explains the roll in words and prints the odds table the roll reads', () => {
    show();
    expect(screen.getByTestId('verify-chest')).toHaveTextContent('Confira um baú você mesmo');
    expect(screen.getByTestId('verify-chest')).toHaveTextContent('A conta, em palavras');
    const rows = within(screen.getByTestId('chest-odds')).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent('070002500450455' + '0');
    expect(mocks.getChest).not.toHaveBeenCalled();
  });

  it('a linked chest is rolled at once and says the same Tera came out, with where each input came from', async () => {
    mocks.getChest.mockResolvedValue(read());
    mocks.recompute.mockResolvedValue(rolled(sample.chest.tera.key));
    show(`/verify?chest=${sample.chest.id}#chest`);
    const result = await screen.findByTestId('chest-recompute-result');
    expect(mocks.getChest).toHaveBeenCalledWith(sample.chest.id);
    expect(mocks.recompute.mock.calls[0][0]).toMatchObject({ certification: sample.chest.certification, day: sample.chest.day, commitTx: sample.chest.commit.tx, teraKey: sample.chest.tera.key, poolDocument: sample.recompute.pool_document });
    expect(result).toHaveAttribute('data-agrees', 'true');
    expect(result).toHaveTextContent(`Deu o mesmo Tera: ${sample.chest.tera.title} (${sample.chest.tera.tier_name}).`);
    expect(result).toHaveTextContent('da Solana');
    expect(result).toHaveTextContent('do Itera');
    expect(result).toHaveTextContent(sample.recompute.steps[0]);
  });

  it('says it when the math gives another Tera', async () => {
    mocks.getChest.mockResolvedValue(read());
    mocks.recompute.mockResolvedValue(rolled('base_lider'));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer o sorteio' }));
    const result = await screen.findByTestId('chest-recompute-result');
    expect(result).toHaveAttribute('data-agrees', 'false');
    expect(result).toHaveTextContent(`Não bateu: a conta dá base_lider, o baú diz ${sample.chest.tera.key}.`);
  });

  it('names what failed: no such chest, a seal written too late', async () => {
    mocks.getChest.mockResolvedValue(null);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer o sorteio' }));
    await waitFor(() => expect(screen.getByTestId('chest-recompute-failed')).toHaveAttribute('data-reason', 'not_found'));
    mocks.getChest.mockResolvedValue(read());
    mocks.recompute.mockResolvedValue({ ok: false, error: 'commit_late' });
    fireEvent.click(screen.getByRole('button', { name: 'Refazer o sorteio' }));
    await waitFor(() => expect(screen.getByTestId('chest-recompute-failed')).toHaveTextContent('O lacre caiu DEPOIS do bloco que ele aponta'));
  });
});
