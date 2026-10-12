import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { Bounty } from '@/types/bounty';
import { EscrowPanel } from './EscrowPanel';

const ESCROW = 'CpmE1111111111111111111111111111111111111A1w';
const PROGRAM = 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const REFUND = 'AMoT111111111111111111111111111111111111113cA';
const bounty = (over: Record<string, unknown> = {}, escrow: Record<string, unknown> = {}) =>
  ({
    status: 'open',
    approver: 'itera',
    postedBy: { kind: 'team', name: 'Itera', wallet: null },
    requirement: { minDays: 3 },
    escrow: { address: ESCROW, explorerUrl: `https://explorer.solana.com/address/${ESCROW}?cluster=devnet`, targetLamports: 50_000_000, refundAddress: REFUND, custody: 'program', programId: PROGRAM, programExplorerUrl: `https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`, daysCheckedBy: 'program', ...escrow },
    ...over,
  }) as unknown as Bounty;
const show = (b: Bounty) => render(<I18nProvider><MemoryRouter><EscrowPanel bounty={b} /></MemoryRouter></I18nProvider>);

describe('EscrowPanel', () => {
  it('shows the facts as tiles and keeps every explanation inside one closed disclosure', () => {
    show(bounty());
    expect(screen.getByTestId('bounty-escrow-target')).toHaveTextContent('0.05 SOL');
    expect(screen.getByTestId('bounty-escrow-custody')).toHaveAttribute('data-custody', 'program');
    expect(screen.getByTestId('bounty-escrow-account')).toBeInTheDocument();
    expect(screen.getByTestId('bounty-escrow-program')).toBeInTheDocument();
    expect(screen.getByTestId('bounty-escrow-refund')).toBeInTheDocument();
    expect(screen.getAllByTestId('bounty-escrow-link')[0]).toHaveAttribute('href', expect.stringContaining(ESCROW));
    const fold = screen.getByTestId('bounty-escrow-how');
    expect(fold).not.toHaveAttribute('open');
    expect(fold).toContainElement(screen.getByTestId('bounty-days-rule'));
    expect(screen.getByTestId('bounty-days-rule')).toHaveAttribute('data-checked-by', 'program');
    expect(fold).toHaveTextContent(REFUND);
    expect(fold).toContainElement(screen.getByTestId('bounty-escrow-explorers'));
    expect(screen.getByTestId('bounty-verify-link')).toHaveAttribute('href', '/verify#program');
  });

  it('names the sponsor wallet as the approver and says only it can release', () => {
    show(bounty({ approver: 'sponsor_wallet', postedBy: { kind: 'wallet', name: 'Acme', wallet: REFUND } }));
    expect(screen.getByTestId('bounty-escrow-approver')).toHaveTextContent('AMoT');
    expect(screen.getByTestId('bounty-escrow-how')).toHaveTextContent(/Só esta carteira libera|Only this wallet releases/);
  });

  it('drops the program facts for an account the server holds, and says so', () => {
    show(bounty({}, { custody: 'itera_server', programId: null, daysCheckedBy: 'attester' }));
    expect(screen.getByTestId('bounty-escrow-custody')).toHaveAttribute('data-custody', 'itera_server');
    expect(screen.queryByTestId('bounty-escrow-program')).toBeNull();
    expect(screen.queryByTestId('bounty-days-rule')).toBeNull();
    expect(screen.queryByTestId('bounty-verify-link')).toBeNull();
  });

  it('carries the paid sentence once the bounty is paid, and renders nothing with no escrow', () => {
    show(bounty({ status: 'paid' }));
    expect(screen.getByTestId('bounty-paid-plain')).toBeInTheDocument();
    const { container } = show(bounty({ escrow: null }));
    expect(container).toBeEmptyDOMElement();
  });
});
