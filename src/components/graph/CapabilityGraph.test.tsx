import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { CapabilityGraphSection } from '@/components/graph/CapabilityGraphSection';
import { PassportGraph } from '@/components/graph/PassportGraph';
import type { AssetRead } from '@/lib/chainClaims';
import type { Capabilities, CapabilityNode } from '@/types/learnerProfile';

const chainQuery = vi.fn();
const evidenceQuery = vi.fn();
const profileQuery = vi.fn();
vi.mock('@/hooks/useChainClaims', () => ({ useChainClaims: () => chainQuery() }));
vi.mock('@/hooks/useLearnerProfile', () => ({
  useClaimEvidence: () => evidenceQuery(),
  useLearnerProfile: () => profileQuery(),
}));

const WALLET = 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya';
const HASH = '2acb55a6bc0e259f'.padEnd(64, '0');
const proof = (id: string, over = {}) => ({
  asset: 'A1', attribute: `claim:${id}`, onchainValue: '2acb55a6bc0e259f', evidenceHash: HASH, txSignature: 'sig', provenAt: null,
  assetExplorerUrl: 'https://explorer.solana.com/address/A1?cluster=devnet', txExplorerUrl: 'https://explorer.solana.com/tx/sig?cluster=devnet', ...over,
});
const node = (id: string, trail: number, day: number, status: CapabilityNode['status'], requires: string[] = [], over: Partial<CapabilityNode> = {}): CapabilityNode => ({
  id, trail, day, title: `Title of ${id}`, requires, status, proof: status === 'open' ? null : proof(id), ...over,
});
const caps: Capabilities = {
  program: 'p', version: 1, total: 4, verifiedCount: 2, next: 'c',
  trails: [{ trail: 0, title: 'Week 1 · HTML' }, { trail: 1, title: 'Week 2 · CSS' }],
  nodes: [node('a', 0, 1, 'verified'), node('b', 0, 2, 'recorded', ['a']), node('c', 1, 1, 'open', ['a', 'b']), node('d', 1, 2, 'open', ['c'])],
};
const reads = (claims: Record<string, string>): Record<string, AssetRead> => ({ A1: { status: 'ok', claims } });
const view = (id: string) => screen.getAllByTestId('graph-node').find((n) => n.getAttribute('data-node-id') === id)!;

const show = (c: Capabilities = caps) =>
  render(<I18nProvider><MemoryRouter><CapabilityGraphSection wallet={WALLET} capabilities={c} /></MemoryRouter></I18nProvider>);

describe('CapabilityGraphSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evidenceQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
  });

  it('lights a node as chain-verified only when the browser read matched', () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({ 'claim:a': '2acb55a6bc0e259f' }), refetch: vi.fn() });
    show();
    expect(view('a')).toHaveAttribute('data-view', 'chain');
    expect(view('b')).toHaveAttribute('data-view', 'recorded');
    expect(view('c')).toHaveAttribute('data-view', 'open');
    expect(view('c')).toHaveAttribute('data-next', 'true');
    expect(screen.getByTestId('graph-counter')).toHaveTextContent('1 / 4');
    expect(view('a')).toHaveAccessibleName(/Verificada na chain/);
    expect(view('b')).toHaveAccessibleName(/Registrada, ainda não está na chain/);
  });

  it('a chain value that does not prefix the hash is never shown as verified', () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({ 'claim:a': 'ffffffffffffffff' }), refetch: vi.fn() });
    show();
    expect(view('a')).toHaveAttribute('data-view', 'unconfirmed');
    expect(screen.getByTestId('graph-counter')).toHaveTextContent('0 / 4');
  });

  it('shows the checking state while the read is in flight', () => {
    chainQuery.mockReturnValue({ isSuccess: false, isError: false, isFetching: true, data: undefined, refetch: vi.fn() });
    show();
    expect(view('a')).toHaveAttribute('data-view', 'checking');
    expect(screen.getByTestId('graph-chain-state')).toHaveTextContent('Conferindo a chain');
  });

  it('on RPC failure falls back to the weaker server label and offers a retry', () => {
    const refetch = vi.fn();
    chainQuery.mockReturnValue({ isSuccess: false, isError: true, isFetching: false, data: undefined, refetch });
    show();
    expect(view('a')).toHaveAttribute('data-view', 'server');
    expect(view('a')).not.toHaveAccessibleName(/Verificada na chain/);
    expect(view('a')).toHaveAccessibleName(/servidor da Itera/);
    fireEvent.click(screen.getByTestId('graph-retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('opens the detail for a proven node with safe explorer links and the full hash', () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({ 'claim:a': '2acb55a6bc0e259f' }), refetch: vi.fn() });
    show();
    fireEvent.click(view('a'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('graph-attribute')).toHaveTextContent('claim:a');
    expect(within(dialog).getByTestId('graph-value')).toHaveTextContent('2acb55a6bc0e259f');
    expect(within(dialog).getByTestId('graph-hash')).toHaveTextContent(HASH);
    expect(within(dialog).getByTestId('graph-tx-link')).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).getByTestId('graph-tx-link')).toHaveAttribute('target', '_blank');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('drops a link that does not point at the Solana explorer', () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({}), refetch: vi.fn() });
    const bad: Capabilities = { ...caps, nodes: [node('a', 0, 1, 'verified', [], { proof: proof('a', { txExplorerUrl: 'https://evil.example/tx', assetExplorerUrl: 'javascript:alert(1)' }) }), ...caps.nodes.slice(1)] };
    show(bad);
    fireEvent.click(view('a'));
    expect(screen.queryByTestId('graph-tx-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph-asset-link')).not.toBeInTheDocument();
  });

  it('an open node lists its prerequisites with their state and how to prove it', () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({ 'claim:a': '2acb55a6bc0e259f' }), refetch: vi.fn() });
    show();
    fireEvent.click(view('c'));
    const help = screen.getByTestId('graph-open-help');
    expect(help).toHaveTextContent('Prove completando o Dia 1 de Week 2 · CSS');
    const rows = within(help).getAllByTestId('graph-prereq');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Verificada na chain');
    expect(rows[1]).toHaveTextContent('Registrada');
  });

  it('shows the hash check from the evidence, computed in the browser', async () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({ 'claim:a': '2acb55a6bc0e259f' }), refetch: vi.fn() });
    const text = '{"completed_at":"2026-10-09T23:23:16.280Z","activities":[["x","t"],["y","t"]]}';
    const { sha256Hex } = await import('@/lib/chainClaims');
    const hash = await sha256Hex(text);
    evidenceQuery.mockReturnValue({ isPending: false, isError: false, data: { evidence: text, evidenceHash: hash } });
    const matching: Capabilities = { ...caps, nodes: [node('a', 0, 1, 'verified', [], { proof: proof('a', { evidenceHash: hash, onchainValue: hash.slice(0, 16) }) }), ...caps.nodes.slice(1)] };
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({ 'claim:a': hash.slice(0, 16) }), refetch: vi.fn() });
    show(matching);
    fireEvent.click(view('a'));
    expect(await screen.findByTestId('graph-hash-ok')).toHaveTextContent('hash confere');
    expect(screen.getByTestId('graph-evidence')).toHaveTextContent('2 atividades concluídas');
  });

  it('warns when the evidence does not hash to the recorded value', async () => {
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: reads({}), refetch: vi.fn() });
    evidenceQuery.mockReturnValue({ isPending: false, isError: false, data: { evidence: '{"tampered":true}', evidenceHash: HASH } });
    show();
    fireEvent.click(view('a'));
    expect(await screen.findByTestId('graph-hash-bad')).toBeInTheDocument();
  });
});

describe('PassportGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainQuery.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: {}, refetch: vi.fn() });
  });
  const open: Capabilities = { ...caps, nodes: caps.nodes.map((n) => ({ ...n, status: 'open' as const, proof: null })) };
  const ok = (c: Capabilities) => ({ isPending: false, isError: false, data: { status: 'ok', profile: { capabilities: c } } });
  const mount = (wallet: string | null) => render(<I18nProvider><MemoryRouter><PassportGraph wallet={wallet} /></MemoryRouter></I18nProvider>);

  it('without a wallet: next card, connect hint, no public link', () => {
    profileQuery.mockReturnValue(ok(open));
    mount(null);
    expect(screen.getByTestId('passport-next-card')).toHaveTextContent('Title of c');
    expect(screen.getByTestId('passport-graph-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('passport-profile-link')).not.toBeInTheDocument();
  });

  it('with a wallet: links to the public profile', () => {
    profileQuery.mockReturnValue(ok(caps));
    mount(WALLET);
    expect(screen.getByTestId('passport-profile-link')).toHaveAttribute('href', `/u/${WALLET}`);
    expect(screen.queryByTestId('passport-graph-hint')).not.toBeInTheDocument();
  });
});
