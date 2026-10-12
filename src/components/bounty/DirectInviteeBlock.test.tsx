import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ShopCallError } from '@/services/shopTransport';
import type { InviteeCheck } from '@/types/bounty';
import { blockingInviteeCode, DirectInviteeBlock, type InviteeCheckState } from './DirectInviteeBlock';

const WALLET = 'BRNkmbKCGxqL4p9W67sgiHRev6VAdzScSqBQYmS36Upx';
const data = (over: Partial<InviteeCheck> = {}): InviteeCheck => ({ wallet: WALLET, directAvailable: true, knownLearner: true, eligible: true, reason: null, proof: { asset: 'A', daysDone: 3, explorerUrl: null }, requirement: { unitId: 'u1', minDays: 2, totalDays: 5 }, ...over });
const state = (over: Partial<InviteeCheckState> = {}): InviteeCheckState => ({ isPending: false, isError: false, error: null, data: data(), ...over });
const show = (check: InviteeCheckState, invitee: string | null = WALLET, onSet = vi.fn(), onRemove = vi.fn()) =>
  render(<I18nProvider><MemoryRouter><DirectInviteeBlock invitee={invitee} onSet={onSet} onRemove={onRemove} check={check} trail="Week 1" /></MemoryRouter></I18nProvider>);

describe('DirectInviteeBlock', () => {
  it('names the wallet, links to its profile, says who enforces it and can be removed', () => {
    const onRemove = vi.fn();
    show(state(), WALLET, vi.fn(), onRemove);
    expect(screen.getByTestId('bounty-post-direct-title')).toHaveTextContent('Missão direta para BRNk…6Upx');
    expect(screen.getByTestId('bounty-post-direct')).toHaveTextContent('programa de escrow na Solana');
    expect(screen.getByTestId('bounty-post-direct-profile')).toHaveAttribute('href', `/u/${WALLET}`);
    fireEvent.click(screen.getByTestId('bounty-post-direct-remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('says plainly that an eligible wallet can accept', () => {
    show(state());
    expect(screen.getByTestId('invitee-eligible')).toHaveTextContent('tem 3 dia(s) carimbado(s) em Week 1, e a missão pede 2');
  });

  it('warns what is missing when the wallet cannot accept', () => {
    const { unmount } = show(state({ data: data({ eligible: false, reason: 'not_enough_days' }) }));
    expect(screen.getByTestId('invitee-not-eligible')).toHaveTextContent('NÃO pode aceitar agora');
    expect(screen.getByTestId('invitee-not-eligible')).toHaveTextContent('3 dia(s)');
    unmount();
    show(state({ data: data({ eligible: false, reason: 'no_certification', proof: null }) }));
    expect(screen.getByTestId('invitee-not-eligible')).toHaveTextContent('Falta a certificação de Week 1');
  });

  it('shows a refusal of the wallet itself and blocks', () => {
    const own = state({ isError: true, error: new ShopCallError('x', 400, 'own_invitee'), data: undefined });
    expect(blockingInviteeCode(own)).toBe('own_invitee');
    show(own);
    expect(screen.getByTestId('invitee-blocked')).toHaveTextContent('sua própria carteira');
  });

  it('does not block on a network failure, but says it could not check', () => {
    const failed = state({ isError: true, error: new Error('net'), data: undefined });
    expect(blockingInviteeCode(failed)).toBeNull();
    show(failed);
    expect(screen.getByTestId('invitee-check-failed')).toBeInTheDocument();
  });

  it('blocks when the program does not take direct bounties', () => {
    expect(blockingInviteeCode(state({ data: data({ directAvailable: false }) }))).toBe('direct_unavailable');
  });

  it('without an invitee offers to type a wallet, refuses a bad one and hands over a good one', () => {
    const onSet = vi.fn();
    show(state({ data: undefined, isPending: false }), null, onSet);
    fireEvent.click(screen.getByTestId('invitee-add'));
    fireEvent.change(screen.getByTestId('invitee-input'), { target: { value: 'nope' } });
    expect(screen.getByTestId('invitee-input-bad')).toBeInTheDocument();
    expect(screen.getByTestId('invitee-apply')).toBeDisabled();
    fireEvent.change(screen.getByTestId('invitee-input'), { target: { value: ` ${WALLET} ` } });
    fireEvent.click(screen.getByTestId('invitee-apply'));
    expect(onSet).toHaveBeenCalledWith(WALLET);
  });
});
