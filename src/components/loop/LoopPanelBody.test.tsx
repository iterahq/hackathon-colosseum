import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { LoopPanelBody } from './LoopPanelBody';

const state = vi.hoisted(() => ({
  wallet: 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya' as string | null,
  loop: {} as Record<string, unknown>,
  stampRead: { state: 'off', profile: null, retry: () => {} } as Record<string, unknown>,
}));
vi.mock('@/hooks/useCompanion', () => ({ useCompanion: () => ({ wallet: state.wallet }) }));
vi.mock('@/hooks/useLoopView', () => ({ useLoopView: () => state.loop }));
vi.mock('@/hooks/useStampRead', () => ({ useStampRead: () => state.stampRead }));
vi.mock('@/components/wallet/LinkWalletButton', () => ({ LinkWalletButton: ({ testId }: { testId?: string }) => <button data-testid={testId}>link</button> }));

const capabilities = {
  program: 'itera-v2',
  version: 1,
  total: 28,
  verifiedCount: 4,
  next: null,
  trails: [{ trail: 0, title: 'Week 1 · HTML' }],
  nodes: [
    { id: 'html-tags', trail: 0, day: 1, title: 'Reads HTML', requires: [], status: 'verified', proof: null },
    { id: 'html-skeleton', trail: 0, day: 1, title: 'Writes a skeleton', requires: [], status: 'recorded', proof: null },
  ],
};
const bounty = (slug: string, minDays: number) => ({ id: slug, slug, title: `Bounty ${slug}`, status: 'open', rewardLamports: 1e7, rewardSol: '0.01 SOL', requirement: { program: 'itera-v2', unitId: 'u', trail: 'Week 1 · HTML', minDays, totalDays: 5 } });

function mount() {
  localStorage.setItem('itera.locale', 'en');
  return render(
    <I18nProvider>
      <MemoryRouter>
        <LoopPanelBody trail={0} day={1} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('LoopPanelBody', () => {
  it('shows this day claims with their chain status, the eligible bounty and the nearest one', () => {
    state.loop = {
      status: 'ready',
      capabilities,
      view: { eligible: [{ bounty: bounty('a', 1), daysDone: 1, missingDays: 0 }], almost: [{ bounty: bounty('b', 3), daysDone: 1, missingDays: 2 }] },
      retry: vi.fn(),
    };
    mount();
    expect(screen.getByTestId('loop-panel')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByText('4 of 28 capabilities verified on chain')).toBeInTheDocument();
    const claims = screen.getAllByTestId('loop-claim').map((c) => c.getAttribute('data-status'));
    expect(claims).toEqual(['verified', 'recorded']);
    expect(screen.getByTestId('loop-profile-link')).toHaveAttribute('href', `/u/${state.wallet}`);
    expect(screen.getByTestId('loop-bounty')).toHaveAttribute('href', '/bounties/a');
    expect(screen.getByTestId('loop-almost')).toHaveTextContent('2 more stamped days in Week 1 · HTML open Bounty b (0.01 SOL)');
  });

  it('never draws the profile beside a confirmed stamp before the chain was read again', () => {
    const stale = { ...capabilities, verifiedCount: 0 };
    state.loop = { status: 'ready', capabilities: stale, view: { eligible: [], almost: [], instant: null }, retry: vi.fn() };
    state.stampRead = { state: 'reading', profile: null, retry: vi.fn() };
    const reading = mount();
    expect(screen.getByTestId('loop-panel')).toHaveAttribute('data-state', 'reading');
    expect(screen.getByText('Reading the chain…')).toBeInTheDocument();
    expect(screen.queryByText(/of 28 capabilities/)).toBeNull();
    reading.unmount();
    const retry = vi.fn();
    state.stampRead = { state: 'behind', profile: null, retry };
    mount();
    expect(screen.getByTestId('loop-panel')).toHaveAttribute('data-state', 'behind');
    expect(screen.queryByText(/of 28 capabilities/)).toBeNull();
    screen.getByTestId('loop-reread').click();
    expect(retry).toHaveBeenCalled();
    state.stampRead = { state: 'off', profile: null, retry: vi.fn() };
  });

  it('offers the bounty an automatic check pays as one button', () => {
    const opening = { bounty: { ...bounty('judge', 1), title: 'Judge bounty: your first page' }, daysDone: 1, missingDays: 0 };
    state.loop = { status: 'ready', capabilities, view: { eligible: [opening], almost: [], instant: opening }, retry: vi.fn() };
    const first = mount();
    expect(screen.getByTestId('loop-instant')).toHaveAttribute('href', '/bounties/judge');
    expect(screen.getByTestId('loop-instant')).toHaveTextContent('You unlocked a paid bounty: Judge bounty: your first page');
    first.unmount();
    state.loop = { status: 'ready', capabilities, view: { eligible: [opening], almost: [], instant: null }, retry: vi.fn() };
    mount();
    expect(screen.queryByTestId('loop-instant')).toBeNull();
  });

  it('says honestly when no open bounty asks for the trail', () => {
    state.loop = { status: 'ready', capabilities, view: { eligible: [], almost: [] }, retry: vi.fn() };
    mount();
    expect(screen.getByTestId('loop-none')).toHaveTextContent('No open bounty asks for this trail yet.');
    expect(screen.getByTestId('loop-board-link')).toHaveAttribute('href', '/bounties');
  });

  it('asks for a wallet when the learner has none, and offers a retry when the read failed', () => {
    state.wallet = null;
    state.loop = { status: 'no-wallet', capabilities: null, view: { eligible: [], almost: [] }, retry: vi.fn() };
    const first = mount();
    expect(screen.getByTestId('loop-panel')).toHaveAttribute('data-state', 'no-wallet');
    expect(screen.getByTestId('loop-connect')).toBeInTheDocument();
    first.unmount();
    state.wallet = 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya';
    state.loop = { status: 'error', capabilities: null, view: { eligible: [], almost: [] }, retry: vi.fn() };
    mount();
    expect(screen.getByTestId('loop-panel')).toHaveAttribute('data-state', 'error');
    expect(screen.getByTestId('loop-retry')).toBeInTheDocument();
  });
});
