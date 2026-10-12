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

const course = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/useContent', () => ({ useProgram: () => ({ data: course.data }) }));

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

describe('BountyActionPanel for a wallet that still lacks stamped days', () => {
  const lesson = (id: string, status: string) => ({ id, activities: [{ id: `${id}-a`, status }] });
  const open = () => ({ ...bounty('open'), direct: false, postedBy: { kind: 'team', name: 'Itera' }, requirement: { program: 'itera-v2', unitId: 'u2', trail: 'Week 2 · CSS', minDays: 3, totalDays: 5 } }) as unknown as BountyDetail;
  const lacking = (daysDone: number | null) => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: () => undefined,
    data: { wallet: 'ME', eligible: false, reason: daysDone === null ? 'no_certification' : 'not_enough_days', proof: daysDone === null ? null : { asset: 'A', daysDone, explorerUrl: null }, judgedBefore: false, claim: null, busyElsewhere: false, notInvited: false, inviteeWallet: null },
  });
  afterEach(() => {
    mine.value = { isPending: true, isError: false, isSuccess: false, data: undefined, refetch: () => undefined };
    course.data = undefined;
  });

  it('sends to the next lesson of the trail and shows what it unlocks', () => {
    mine.value = lacking(1);
    course.data = { units: [{ id: 'u2', lessons: [lesson('l1', 'done'), lesson('l2', 'todo'), lesson('l3', 'todo')] }] };
    show(open());
    const button = screen.getByTestId('bounty-study');
    expect(button).toHaveAttribute('href', '/lesson/l2');
    expect(button).toHaveTextContent(/Study day 2|Estudar o dia 2/);
    expect(screen.getByTestId('bounty-missing')).toHaveAttribute('data-done', '1');
    const badges = screen.getAllByTestId('skill-badge');
    expect(badges.map((badge) => badge.getAttribute('data-claim'))).toEqual(['css-box', 'css-sizing']);
    expect(badges.every((badge) => badge.getAttribute('data-state') === 'locked')).toBe(true);
  });

  it('starts at day 1 with no certification', () => {
    mine.value = lacking(null);
    course.data = { units: [{ id: 'u2', lessons: [lesson('l1', 'todo')] }] };
    show(open());
    expect(screen.getByTestId('bounty-study')).toHaveAttribute('href', '/lesson/l1');
    expect(screen.getAllByTestId('skill-badge').map((badge) => badge.getAttribute('data-claim'))).toEqual(['css-rules', 'css-selectors']);
  });

  it('sends to the passport when the lesson is finished and only the stamp is missing', () => {
    mine.value = lacking(1);
    course.data = { units: [{ id: 'u2', lessons: [lesson('l1', 'done'), lesson('l2', 'done')] }] };
    show(open());
    expect(screen.getByTestId('bounty-study')).toHaveAttribute('href', '/passport');
  });

  it('falls back to the program page when the course cannot be read', () => {
    mine.value = lacking(1);
    show(open());
    expect(screen.getByTestId('bounty-study')).toHaveAttribute('href', '/program/itera-v2');
    expect(screen.getByTestId('bounty-study')).toHaveAttribute('data-target', 'program');
  });
});
