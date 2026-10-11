import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import VerifyPage from '@/pages/VerifyPage';
import { sha256Hex } from '@/lib/chain/base58';
import { ESCROW_PROGRAM } from '@/lib/chain/escrowAccount';
import { PROGRAM_BASE64, PROGRAM_DATA_HEADER_BASE64 } from '@/lib/chain/fixtures';
import { parseProgramDataHeader, programDataAddress } from '@/lib/chain/programData';
import { SAMPLE_ASSET } from '@/lib/chain/samples';

const readAccount = vi.fn();
const getClaimEvidence = vi.fn();
const state = vi.hoisted(() => ({ attributes: [] as Array<{ key: string; value: string }> }));

vi.mock('@/lib/chain/rpc', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/chain/rpc')>()), readAccount: (...args: unknown[]) => readAccount(...args) }));
vi.mock('@/lib/chain/coreAsset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chain/coreAsset')>()),
  parseCoreAsset: () => ({ owner: 'OwnerWallet', collection: null, updateAuthority: null, name: 'x', uri: 'u', plugins: [], attributes: state.attributes, frozen: false, frozenBy: null }),
}));
vi.mock('@/services/learnerProfile.service', () => ({ getClaimEvidence: (...args: unknown[]) => getClaimEvidence(...args) }));
vi.mock('@/hooks/useBounties', () => ({ useBountySession: () => ({ signedIn: false, userId: 'anon' }) }));

const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const BINARY = Uint8Array.from([7, 8, 9, 10, 11]);
const programBytes = bytes(PROGRAM_BASE64);
const dataAddress = programDataAddress(programBytes) ?? '';
const header = bytes(PROGRAM_DATA_HEADER_BASE64);
const fullData = (() => {
  const data = new Uint8Array(header.length + BINARY.length + 20);
  data.set(header);
  data.set(BINARY, header.length);
  return data;
})();

const SOURCE = ['fn x() {', '}', 'fn accept(a: u8) {', '    let gate = 1;', '}', 'fn y() {', '}'].join('\n');

let served: Uint8Array = BINARY;
let idlHash = '';

function respond(path: string): Response {
  if (path.endsWith('.so')) return { ok: true, arrayBuffer: async () => served.slice().buffer } as unknown as Response;
  if (path.endsWith('.rs')) return { ok: true, text: async () => SOURCE } as unknown as Response;
  return {
    ok: true,
    json: async () => ({
      metadata: { binary_sha256: idlHash, built_by: 'a CI workflow', source: '', binary: '', framework: '' },
      instructions: [
        { name: 'accept', accounts: [{ name: 'attester', signer: true }, { name: 'claimant', signer: true }], checks: 'owner must match' },
        { name: 'later', accounts: [{ name: 'anyone', signer: true }], checks: 'a rule with no message yet' },
      ],
    }),
  } as unknown as Response;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/verify']}>
          <VerifyPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>
  );
}

describe('VerifyPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    served = BINARY;
    idlHash = await sha256Hex(BINARY);
    state.attributes = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string) => respond(path)));
    readAccount.mockImplementation(async (address: string, slice?: { offset: number; length: number }) => {
      if (address === ESCROW_PROGRAM) return { address, owner: 'Loader', lamports: 1, executable: true, data: programBytes, slot: 10 };
      if (address === dataAddress) return { address, owner: 'Loader', lamports: 1, executable: false, data: slice ? fullData.slice(slice.offset, slice.offset + slice.length) : fullData, slot: 11 };
      if (address === SAMPLE_ASSET) return { address, owner: 'Core', lamports: 1, executable: false, data: new Uint8Array(4), slot: 12 };
      return null;
    });
  });

  it('shows the upgrade authority and the deploy slot read from the program data header', async () => {
    show();
    const expected = parseProgramDataHeader(header);
    expect(await screen.findByTestId('program-authority')).toHaveTextContent(expected?.upgradeAuthority ?? 'missing');
    expect(screen.getByTestId('program-slot')).toHaveTextContent(String(expected?.lastDeployedSlot.toLocaleString('en-US')));
    expect(readAccount).toHaveBeenCalledWith(dataAddress, { offset: 0, length: 45 });
  });

  it('has every section anchor', () => {
    show();
    for (const id of ['program', 'source', 'evidence', 'soulbound', 'gate', 'rpc', 'durable', 'trust']) expect(document.getElementById(id)).not.toBeNull();
  });

  it('renders the instruction table from the IDL and the accept function from the source', async () => {
    show();
    expect(await screen.findByText(/^Aberta e não expirada; quem aceita assinou/)).toBeInTheDocument();
    expect(screen.getByText('a rule with no message yet')).toBeInTheDocument();
    expect(await screen.findByLabelText('A função accept do programa de escrow')).toHaveTextContent('let gate = 1;');
  });

  it('says match when the deployed code equals the published file', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir o código publicado' }));
    const verdict = await screen.findByTestId('program-verdict');
    expect(verdict).toHaveTextContent('Igual');
  });

  it('says DIFFERENT when the bytes differ', async () => {
    served = Uint8Array.from([7, 8, 9, 10, 12]);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir o código publicado' }));
    expect(await screen.findByTestId('program-verdict')).toHaveTextContent('DIFERENTE');
  });

  it('recomputes an evidence hash and matches the on-chain prefix', async () => {
    const document = '{"claim":"html-skeleton","v":2}';
    const hash = await sha256Hex(document);
    getClaimEvidence.mockResolvedValue({ evidence: document, evidenceHash: hash });
    state.attributes = [{ key: 'claim:html-skeleton', value: hash.slice(0, 16) }];
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular' }));
    const verdict = await screen.findByTestId('evidence-verdict');
    await waitFor(() => expect(verdict).toHaveAttribute('data-verdict', 'match'));
    expect(screen.getByTestId('evidence-result')).toHaveTextContent(hash);
  });

  it('says no match when the document was changed after stamping', async () => {
    const hash = await sha256Hex('{"claim":"html-skeleton","v":2}');
    getClaimEvidence.mockResolvedValue({ evidence: '{"claim":"html-skeleton","v":3}', evidenceHash: hash });
    state.attributes = [{ key: 'claim:html-skeleton', value: hash.slice(0, 16) }];
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular' }));
    expect(await screen.findByTestId('evidence-verdict')).toHaveAttribute('data-verdict', 'no-match');
  });
});
