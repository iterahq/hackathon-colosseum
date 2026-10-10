import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { StampCeremony } from '@/components/passport/StampCeremony';
import type { CeremonyStatus } from '@/types/achievements';
import type { CeremonyModel } from '@/utils/ceremony';
vi.mock('@/hooks/useLearnerAvatar', async () => {
  const { DEFAULT_AVATAR } = await import('@/types/avatar');
  return { useLearnerAvatar: () => DEFAULT_AVATAR };
});

vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));

const model = (status: CeremonyStatus, over: Partial<CeremonyModel> = {}): CeremonyModel => ({
  day: 3, daysDone: over.day ?? 3, totalDays: 5, trailTitle: 'HTML', status, last: false, newMedals: [], txSignature: null, assetAddress: null, ...over,
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

  it('dresses the ceremony Tera in the equipped outfit and names the feature on the card', () => {
    show(model('minting'), { outfit: 'outfit_crown' });
    expect(screen.getByTestId('tera-outfit')).toHaveAttribute('data-outfit', 'outfit_crown');
    expect(screen.getByText('CERTIFICAÇÕES DO TERA')).toBeInTheDocument();
  });

  it('minted: links to the transaction and names the new medal', () => {
    show(model('minted', { txSignature: 'sig', newMedals: [{ key: 'm', title: 'Streak 3', glyph: 'D3', kind: 'streak', credentialId: null }] }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com carteira' }));
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
    expect(screen.getByRole('dialog', { name: 'Trilha completa — certificação dourada!' })).toBeInTheDocument();
    expect(screen.getByTestId('passport-page')).toHaveAttribute('data-variant', 'gold');
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('gold names the certification that turned gold', () => {
    show(model('minted', { day: 5, last: true }));
    settle();
    expect(screen.getByTestId('ceremony-gold')).toHaveTextContent('Certificação dourada: HTML');
  });

  it('preparing: page with the previous stamps, Tera and the minting row at once, nothing claimed', () => {
    const view = show(model('minting', { day: 5, last: false }), { preparing: true });
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.getByTestId('stamp-ceremony')).toHaveAttribute('data-phase', 'preparing');
    expect(screen.getByRole('dialog', { name: 'Carimbando o dia 5…' })).toBeInTheDocument();
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Carimbando na Solana…');
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.getByTestId('passport-counter')).toHaveTextContent('4/5');
    expect(screen.getByTestId('passport-page')).toHaveAttribute('data-variant', 'active');
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
    // `passport` takes ~6 s: the way out stays shut for as long as the ceremony prepares, not for 2 s.
    act(() => void vi.advanceTimersByTime(15_000));
    expect(screen.getByTestId('ceremony-actions')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('ceremony-actions-waiting')).toBeDisabled();
    expect(screen.getByTestId('ceremony-actions-waiting')).toHaveTextContent('Carimbando…');
    expect(screen.queryByRole('button', { name: 'next' })).not.toBeInTheDocument();
    expect(screen.getByTestId('passport-counter')).toHaveTextContent('4/5');
    view.unmount();
  });

  it('preparing -> server says gold: the stamp lands, then gold, in the same screen', () => {
    const tree = (m: CeremonyModel, preparing: boolean) => (
      <I18nProvider>
        <MemoryRouter>
          <StampCeremony model={m} preparing={preparing} colorIndex={1} actions={<button type="button">next</button>} />
        </MemoryRouter>
      </I18nProvider>
    );
    const view = render(tree(model('minting', { day: 5 }), true));
    act(() => void vi.advanceTimersByTime(4000));
    const node = screen.getByTestId('stamp-ceremony');
    expect(screen.getByTestId('passport-page')).toHaveAttribute('data-variant', 'active');
    view.rerender(tree(model('minted', { day: 5, last: true, txSignature: 'sig' }), false));
    expect(screen.getByTestId('stamp-ceremony')).toBe(node);
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Carimbando na Solana…');
    act(() => void vi.advanceTimersByTime(350));
    expect(screen.getByTestId('passport-counter')).toHaveTextContent('5/5');
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByRole('dialog', { name: 'Trilha completa — certificação dourada!' })).toBeInTheDocument();
    expect(screen.getByTestId('passport-page')).toHaveAttribute('data-variant', 'gold');
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Carimbado na Solana');
    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
    expect(screen.queryByTestId('ceremony-actions-waiting')).not.toBeInTheDocument();
  });

  it.each(['minted', 'no_wallet', 'failed', 'pending'] as const)('%s resolves the ceremony and opens the lesson buttons', (status) => {
    show(model(status));
    expect(screen.queryByRole('button', { name: 'next' })).not.toBeInTheDocument();
    settle();
    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
  });

  it('a retry in flight (minting again) shuts the way out until it resolves', () => {
    show(model('minting'));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByTestId('ceremony-actions-waiting')).toBeDisabled();
  });

  it('keeps the lesson buttons and the passport link at the bottom', () => {
    show(model('minted'));
    settle();
    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver minhas certificações →' })).toHaveAttribute('href', '/passport');
  });
});
