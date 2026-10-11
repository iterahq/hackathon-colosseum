import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { ChainProof } from '@/components/chain/ChainProof';
import { ESCROW_PROGRAM, parseEscrowAccount } from '@/lib/chain/escrowAccount';
import { ESCROW_BASE64 } from '@/lib/chain/fixtures';

const readAccount = vi.fn();
vi.mock('@/lib/chain/rpc', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/chain/rpc')>()), readAccount: (...args: unknown[]) => readAccount(...args) }));

const ADDRESS = 'CEyuCmKRaEkfTgkubv2nMQWnY2fmDKszANGNRego5nef';
const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </I18nProvider>
  );
}

describe('ChainProof', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links three explorers, all on devnet, and reads nothing until asked', () => {
    show(<ChainProof kind="address" value={ADDRESS} label="Explorer" />);
    expect(screen.getByRole('link', { name: 'Explorer ↗' })).toHaveAttribute('href', `https://explorer.solana.com/address/${ADDRESS}?cluster=devnet`);
    expect(screen.getByTestId('chain-proof-solscan')).toHaveAttribute('href', `https://solscan.io/account/${ADDRESS}?cluster=devnet`);
    expect(screen.getByTestId('chain-proof-solanafm')).toHaveAttribute('href', `https://solana.fm/address/${ADDRESS}?cluster=devnet-solana`);
    expect(readAccount).not.toHaveBeenCalled();
  });

  it('reads the account once when expanded and shows the decoded escrow fields', async () => {
    readAccount.mockResolvedValue({ address: ADDRESS, owner: ESCROW_PROGRAM, lamports: 1_002_039_280, executable: false, data: bytes(ESCROW_BASE64), slot: 123456, });
    show(<ChainProof kind="address" value={ADDRESS} />);
    fireEvent.click(screen.getByTestId('chain-proof-raw'));
    const status = await screen.findByTestId('raw-escrow-status');
    expect(status).toHaveTextContent(parseEscrowAccount(bytes(ESCROW_BASE64))?.status ?? 'missing');
    expect(screen.getByTestId('raw-account')).toHaveTextContent('slot 123,456');
    expect(screen.getByTestId('raw-account')).toHaveTextContent('1.00203928 SOL');
    expect(screen.getByTestId('raw-curl')).toHaveTextContent('getAccountInfo');
    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(readAccount.mock.calls[0][0]).toBe(ADDRESS);
  });

  it('says so when the account does not exist', async () => {
    readAccount.mockResolvedValue(null);
    show(<ChainProof kind="address" value={ADDRESS} />);
    fireEvent.click(screen.getByTestId('chain-proof-raw'));
    expect(await screen.findByText('Esta conta não existe na devnet.')).toBeInTheDocument();
  });

  it('offers a retry when the node fails', async () => {
    readAccount.mockRejectedValueOnce(new Error('down')).mockResolvedValue(null);
    show(<ChainProof kind="address" value={ADDRESS} />);
    fireEvent.click(screen.getByTestId('chain-proof-raw'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Esta conta não existe na devnet.')).toBeInTheDocument();
  });

  it('adds only the alternatives when the primary link is already on screen', () => {
    show(<ChainProof kind="tx" value="sig1" primary={false} raw={false} />);
    expect(screen.queryByTestId('chain-proof-raw')).toBeNull();
    expect(screen.getByTestId('chain-proof-solscan')).toHaveAttribute('href', 'https://solscan.io/tx/sig1?cluster=devnet');
  });
});
