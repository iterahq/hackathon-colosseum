import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { StampCeremony } from '@/components/passport/StampCeremony';
import type { CeremonyStatus } from '@/types/achievements';
import type { CeremonyModel } from '@/utils/ceremony';

vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));

const model = (status: CeremonyStatus, over: Partial<CeremonyModel> = {}): CeremonyModel => ({
  day: 3, totalDays: 5, trailTitle: 'HTML', status, last: false, newMedals: [], txSignature: null, assetAddress: null, ...over,
});

function show(m: CeremonyModel, handlers = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <StampCeremony model={m} colorIndex={1} actions={<button type="button">next</button>} {...handlers} />
      </MemoryRouter>
    </I18nProvider>
  );
}
const settle = () => act(() => void vi.advanceTimersByTime(1700));

describe('StampCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stamps the day and ticks the counter, then shows the chain row', () => {
    show(model('minting'));
    expect(screen.queryByTestId('ceremony-status')).not.toBeInTheDocument();
    settle();
    expect(screen.getByRole('dialog', { name: 'Dia 3 carimbado!' })).toBeInTheDocument();
    expect(screen.getByTestId('passport-counter')).toHaveTextContent('3/5');
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Carimbando na Solana…');
  });

  it('minted: links to the transaction and names the new medal', () => {
    show(model('minted', { txSignature: 'sig', newMedals: [{ key: 'm', title: 'Streak 3', glyph: 'D3' }] }));
    settle();
    expect(screen.getByRole('link', { name: /Ver transação/ })).toHaveAttribute('href', 'https://explorer.solana.com/tx/sig?cluster=devnet');
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Nova medalha: Streak 3');
  });

  it('failed: offers retry and later', () => {
    const onRetry = vi.fn();
    const onLater = vi.fn();
    show(model('failed'), { onRetry, onLater });
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onLater).toHaveBeenCalledOnce();
  });

  it('no wallet: offers to connect one', () => {
    const onConnect = vi.fn();
    show(model('no_wallet'), { onConnect });
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar carteira' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('pending authority is neutral: no retry, no error', () => {
    show(model('pending'));
    settle();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('pendente');
  });

  it('the last day turns the page gold with confetti', () => {
    show(model('minted', { day: 5, last: true }));
    settle();
    expect(screen.getByRole('dialog', { name: 'Trilha completa — página de ouro!' })).toBeInTheDocument();
    expect(screen.getByTestId('passport-page')).toHaveAttribute('data-variant', 'gold');
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('keeps the lesson buttons and the passport link at the bottom', () => {
    show(model('minted'));
    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meu passaporte →' })).toHaveAttribute('href', '/passport');
  });
});
