import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { BountyDetail } from '@/types/bounty';
import { BountyActionPanel } from './ActionPanel';

const mine = vi.hoisted(() => ({ value: { isPending: true, isError: false, isSuccess: false, data: undefined as unknown, refetch: () => undefined } }));
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@/hooks/useBounties', () => {
  const step = { pending: false, phase: null, outcome: null, explorerUrl: null, error: null, run: () => undefined };
  return {
    useBountySession: () => ({ signedIn: session.signedIn, userId: 'u1' }),
    useMyBountyStatus: () => mine.value,
    useSignedBountyStep: () => step,
    useJudgeSubmit: () => ({ ...step, isPending: false, status: null }),
  };
});

const bounty = (status: BountyDetail['status']) => ({ id: 'b1', slug: 's', status, direct: true, judge: null, claim: null, escrow: null, postedBy: { kind: 'wallet', wallet: 'W' }, claimHours: 24, requirement: { trail: 'Week 1', minDays: 1, totalDays: 5, program: null } }) as unknown as BountyDetail;
const show = (b: BountyDetail) => render(<I18nProvider><MemoryRouter><BountyActionPanel bounty={b} /></MemoryRouter></I18nProvider>);

describe('BountyActionPanel on a settled bounty', () => {
  it('renders no card while the status is loading or failed', () => {
    show(bounty('paid'));
    expect(screen.queryByTestId('bounty-action')).toBeNull();
  });

  it('still shows the loading card on an open bounty', () => {
    show(bounty('open'));
    expect(screen.getByTestId('bounty-action-reading')).toBeInTheDocument();
  });
});

describe('BountyActionPanel on a bounty a wallet posted and nobody funded', () => {
  const waiting = (fundActionUrl: string | null) => ({ ...bounty('awaiting_funding'), fundActionUrl, fundBlinkUrl: 'https://dial.to/?action=x', postedBy: { kind: 'wallet', wallet: 'W', walletShort: 'W…W', name: 'Acme' } }) as unknown as BountyDetail;
  afterEach(() => {
    session.signedIn = true;
  });

  it('tells a signed-out visitor it waits for funds and shows the funding link', () => {
    session.signedIn = false;
    show(waiting('https://fn.test/bounty-action/s'));
    expect(screen.getByTestId('bounty-action-title')).toHaveTextContent(/waiting for funds|esperando os fundos/);
    expect(screen.getByTestId('bounty-funding-link')).toHaveAttribute('data-audience', 'visitor');
    expect(screen.getByTestId('bounty-funding-link-url')).toHaveTextContent('https://fn.test/bounty-action/s');
    expect(screen.getByTestId('bounty-funding-link-blink')).toHaveAttribute('href', 'https://dial.to/?action=x');
    expect(screen.getByTestId('bounty-funding-link')).toHaveTextContent('W…W');
  });

  it('shows nothing to a signed-out visitor when the server offers no link', () => {
    session.signedIn = false;
    show(waiting(null));
    expect(screen.queryByTestId('bounty-action')).toBeNull();
  });
});
