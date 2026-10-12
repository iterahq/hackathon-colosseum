import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { LedgerEvent } from '@/types/bounty';
import { Ledger } from './Ledger';

const SIG = '5'.repeat(64);
const event = (over: Partial<LedgerEvent>): LedgerEvent => ({ kind: 'created', wallet: null, lamports: null, sol: null, signature: null, signedBy: null, signedRole: null, explorerUrl: null, at: '2026-10-11T03:57:00Z', ...over });
const show = (events: LedgerEvent[], judge = false) =>
  render(<I18nProvider><MemoryRouter><Ledger events={events} judge={judge ? { checks: [], codeMax: 1 } : null} /></MemoryRouter></I18nProvider>);

describe('Ledger', () => {
  it('is a tight row per step: a server record is tagged, a chain step has one link, the signer is inside the step', () => {
    show([
      event({}),
      event({ kind: 'funded', sol: '0.05 SOL', signature: SIG, signedBy: 'AMoT111111111111111111111111111111111111113cA', signedRole: 'itera_treasury', explorerUrl: `https://explorer.solana.com/tx/${SIG}?cluster=devnet` }),
    ]);
    const [created, funded] = screen.getAllByTestId('bounty-event');
    expect(created).toHaveAttribute('data-chain', 'false');
    expect(within(created).getByTestId('bounty-event-server')).toBeInTheDocument();
    expect(within(created).queryByTestId('bounty-event-link')).toBeNull();
    expect(within(created).getByTestId('bounty-event-signer')).toHaveAttribute('data-signer', 'offchain');
    expect(funded).toHaveAttribute('data-chain', 'true');
    expect(within(funded).queryByTestId('bounty-event-server')).toBeNull();
    expect(within(funded).getByTestId('bounty-event-link')).toHaveAttribute('href', expect.stringContaining(SIG));
    expect(within(funded).getByTestId('bounty-event-signer')).toHaveAttribute('data-signer', 'signedTreasury');
    expect(funded.querySelector('details')).not.toHaveAttribute('open');
    expect(funded).toHaveTextContent('0.05 SOL');
  });

  it('shortens a long label on the row and keeps the whole sentence inside the step', () => {
    show([event({ kind: 'escrow_moved', signature: SIG, explorerUrl: `https://explorer.solana.com/tx/${SIG}?cluster=devnet` }), event({ kind: 'approved' })], true);
    const [moved, approved] = screen.getAllByTestId('bounty-event');
    expect(within(moved).getByTestId('bounty-event-name')).toHaveTextContent(/^(Escrow movido|Escrow moved)$/);
    expect(within(moved).getByTestId('bounty-event-label')).toHaveTextContent(/conta antiga devolveu|old account returned/);
    expect(within(approved).getByTestId('bounty-event-name')).toHaveTextContent(/verificação automática|automatic check/);
    expect(within(approved).getByTestId('bounty-event-label')).toHaveTextContent(/não por uma pessoa|not by a person/);
  });

  it('never links a step to something that is not an https address', () => {
    show([event({ kind: 'paid', signature: SIG, explorerUrl: 'javascript:alert(1)' })]);
    expect(screen.queryByTestId('bounty-event-link')).toBeNull();
  });

  it('says so when nothing is recorded, and keeps the explanation folded', () => {
    show([]);
    expect(screen.getByTestId('bounty-ledger')).toHaveTextContent(/Nada registrado|Nothing recorded/);
    expect(screen.getByTestId('bounty-ledger-how')).not.toHaveAttribute('open');
  });
});
