import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LivePodium } from '@/components/live/LivePodium';
import type { PodiumChainPlace } from '@/types/classPodium';

const entry = (userId: string, name: string, rank: number) => ({ userId, name, avatarUrl: null, totalMs: 1000 * rank, answeredCount: 3, correctCount: 4 - rank, rank });
const ranking = { ranked: [entry('a', 'Ana', 1), entry('b', 'Bruno', 2), entry('c', 'Caio', 3)], pending: [] } as unknown as Parameters<typeof LivePodium>[0]['ranking'];

function renderPodium(chain?: PodiumChainPlace[]) {
  return render(
    <I18nProvider>
      <LivePodium ranking={ranking} chain={chain} />
    </I18nProvider>
  );
}

describe('LivePodium on-chain marks', () => {
  it('shows nothing while the podium is not recorded', () => {
    renderPodium();
    expect(screen.queryByTestId('live-podium-onchain')).toBeNull();
  });

  it('marks only the learners whose medal is minted, matched by learner and linking to the explorer', () => {
    renderPodium([
      { position: 1, userId: 'b', minted: true, explorerUrl: 'https://explorer.solana.com/address/B?cluster=devnet' },
      { position: 2, userId: 'c', minted: false, explorerUrl: null },
    ]);
    const marks = screen.getAllByTestId('live-podium-onchain');
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute('href')).toBe('https://explorer.solana.com/address/B?cluster=devnet');
    expect(marks[0].closest('[data-testid="live-podium-place"]')?.textContent).toContain('Bruno');
  });
});
