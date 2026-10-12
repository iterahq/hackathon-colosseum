import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { BountyDetail } from '@/types/bounty';
import { SkillQuestCard } from './SkillQuestCard';

const mine = vi.hoisted(() => ({ value: { isSuccess: false, data: undefined as unknown } }));
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@/hooks/useBounties', () => ({
  useBountySession: () => ({ signedIn: session.signedIn, userId: 'u1' }),
  useMyBountyStatus: () => mine.value,
}));

const bounty = (over: Record<string, unknown> = {}) =>
  ({ id: 'b1', slug: 's', status: 'open', postedBy: { kind: 'team', name: 'Itera' }, escrow: { daysCheckedBy: 'program' }, requirement: { program: 'itera-v2', unitId: 'u2', trail: 'Week 2 · CSS', minDays: 3, totalDays: 5 }, ...over }) as unknown as BountyDetail;
const answer = (over: Record<string, unknown>) => ({ isSuccess: true, data: { wallet: 'ME', eligible: false, reason: null, proof: null, judgedBefore: false, claim: null, busyElsewhere: false, notInvited: false, inviteeWallet: null, ...over } });
const show = (b = bounty()) => render(<I18nProvider><MemoryRouter><SkillQuestCard bounty={b} /></MemoryRouter></I18nProvider>);
const states = () => screen.getAllByTestId('skill-badge').map((badge) => badge.getAttribute('data-state'));

describe('SkillQuestCard', () => {
  afterEach(() => {
    session.signedIn = true;
    mine.value = { isSuccess: false, data: undefined };
  });

  it('is neutral for a visitor: every badge, no count in the ring', () => {
    session.signedIn = false;
    show();
    expect(screen.getByTestId('skill-quest')).toHaveAttribute('data-state', 'neutral');
    expect(states()).toEqual(Array(6).fill('neutral'));
    expect(screen.getByTestId('quest-ring')).not.toHaveAttribute('data-done');
    expect(screen.getByTestId('quest-ring')).toHaveTextContent('3');
    expect(screen.queryByTestId('quest-ready')).toBeNull();
  });

  it('stays neutral while the status is loading and when it failed', () => {
    show();
    expect(states()).toEqual(Array(6).fill('neutral'));
  });

  it('lights the days the gate read, marks the next day and locks the rest', () => {
    mine.value = answer({ reason: 'not_enough_days', proof: { asset: 'A', daysDone: 1, explorerUrl: null } });
    show();
    expect(screen.getByTestId('skill-quest')).toHaveAttribute('data-state', 'locked');
    expect(states()).toEqual(['lit', 'lit', 'locked', 'locked', 'locked', 'locked']);
    expect(screen.getAllByTestId('quest-day').map((day) => day.getAttribute('data-state'))).toEqual(['done', 'next', 'locked']);
    expect(screen.getByTestId('quest-ring')).toHaveAttribute('data-done', '1');
    expect(screen.getByTestId('quest-ring')).toHaveTextContent('1/3');
  });

  it('locks everything when the gate found no certification', () => {
    mine.value = answer({ reason: 'no_certification' });
    show();
    expect(states()).toEqual(Array(6).fill('locked'));
    expect(screen.getByTestId('quest-ring')).toHaveTextContent('0/3');
  });

  it('celebrates only when the gate says eligible, and never counts past the minimum', () => {
    mine.value = answer({ eligible: true, proof: { asset: 'A', daysDone: 5, explorerUrl: null } });
    show();
    expect(screen.getByTestId('skill-quest')).toHaveAttribute('data-state', 'ready');
    expect(states()).toEqual(Array(6).fill('lit'));
    expect(screen.getByTestId('quest-ring')).toHaveTextContent('3/3');
    expect(screen.getByTestId('quest-ready')).toBeInTheDocument();
  });

  it('does not judge the sponsor or a wallet the bounty is not for', () => {
    mine.value = answer({ notInvited: true, reason: 'not_invited', proof: { asset: 'A', daysDone: 5, explorerUrl: null } });
    show();
    expect(states()).toEqual(Array(6).fill('neutral'));
  });

  it('says who checks the days and links to the gate', () => {
    session.signedIn = false;
    show();
    expect(screen.getByTestId('quest-gate')).toHaveTextContent(/programa confere 3 dias|program checks 3 stamped days/);
    expect(screen.getByTestId('quest-gate').querySelector('a')).toHaveAttribute('href', '/verify#gate');
  });

  it('names the server when the escrow is not gated, and keeps the plain chip for a trail outside the graph', () => {
    session.signedIn = false;
    show(bounty({ escrow: null, requirement: { program: 'itera-v2', unitId: 'u9', trail: 'Week 9 · Rust', minDays: 2, totalDays: 5 } }));
    expect(screen.getByTestId('quest-gate')).toHaveTextContent(/servidor da Itera confere 2 dias|server checks 2 stamped days/);
    expect(screen.queryByTestId('quest-days')).toBeNull();
    expect(screen.getByText(/Week 9 · Rust · 2/)).toBeInTheDocument();
  });
});
