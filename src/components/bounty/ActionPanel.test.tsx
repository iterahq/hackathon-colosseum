import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { BountyDetail } from '@/types/bounty';
import { BountyActionPanel } from './ActionPanel';

const mine = vi.hoisted(() => ({ value: { isPending: true, isError: false, isSuccess: false, data: undefined as unknown, refetch: () => undefined } }));
vi.mock('@/hooks/useBounties', () => {
  const step = { pending: false, phase: null, outcome: null, explorerUrl: null, error: null, run: () => undefined };
  return {
    useBountySession: () => ({ signedIn: true, userId: 'u1' }),
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
