import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '@/lib/chain/base58';
import { arweaveOwnerOf, checkCopy, fetchCopy, parseArchive, type ArchiveCopy } from '@/services/credentialArchive.service';

const copyRow = (overrides: Record<string, unknown> = {}) => ({ kind: 'evidence', claim: 'html-tags', sha256: 'a'.repeat(64), arweave_id: 'x'.repeat(43), bytes: 12, archived_at: '2026-10-11T12:00:00Z', urls: ['https://turbo-gateway.com/x', 'https://arweave.net/x'], ...overrides });
const answer = (body: BodyInit | null, status = 200) => new Response(body, { status });

afterEach(() => vi.unstubAllGlobals());

describe('parseArchive', () => {
  it('reads the copies the function answers', () => {
    const archive = parseArchive({
      asset: 'ASSET',
      signer: 'SIGNER',
      uploads_enabled: true,
      current: { metadata: copyRow({ kind: 'metadata', claim: null }), image: null },
      evidence: [copyRow(), { kind: 'evidence' }],
      find: { endpoints: ['https://turbo-gateway.com/graphql'], query: '{ q }' },
      failed_uploads: 1,
    });
    expect(archive?.metadata?.arweaveId).toBe('x'.repeat(43));
    expect(archive?.image).toBeNull();
    expect(archive?.evidence.map((copy) => copy.claim)).toEqual(['html-tags']);
    expect(archive?.findQuery).toBe('{ q }');
    expect(archive?.failedUploads).toBe(1);
    expect(archive?.uploadsEnabled).toBe(true);
  });

  it('answers null without an asset or a signer, and drops a copy with no https address', () => {
    expect(parseArchive({ signer: 'S' })).toBeNull();
    expect(parseArchive({ asset: 'A', signer: 'S', current: { metadata: copyRow({ urls: ['javascript:alert(1)'] }) } })?.metadata).toBeNull();
  });
});

describe('fetchCopy and checkCopy', () => {
  const document = '{"v":1,"claim":"html-tags"}';
  const copyOf = async (overrides: Partial<ArchiveCopy> = {}): Promise<ArchiveCopy> => ({ kind: 'evidence', claim: 'html-tags', sha256: await sha256Hex(document), arweaveId: 'x', bytes: document.length, archivedAt: null, urls: ['https://turbo-gateway.com/x', 'https://arweave.net/x'], ...overrides });

  it('falls back to the second gateway when the first does not have the copy', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(answer(null, 404)).mockResolvedValueOnce(answer(document));
    vi.stubGlobal('fetch', fetchMock);
    const got = await fetchCopy(await copyOf());
    expect(got.from).toBe('arweave.net');
    expect(new TextDecoder().decode(got.bytes)).toBe(document);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says a copy is intact and matches the chain when its hash starts with the on-chain value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(document)));
    const copy = await copyOf();
    const check = await checkCopy(copy, new Map([['html-tags', copy.sha256.slice(0, 16)]]));
    expect(check).toMatchObject({ intact: true, matchesChain: true, from: 'turbo-gateway.com', onchain: copy.sha256.slice(0, 16) });
  });

  it('says so when the bytes are not the ones listed, or the chain holds another value, or no value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => answer('{"tampered":true}')));
    const copy = await copyOf();
    expect(await checkCopy(copy, new Map([['html-tags', copy.sha256.slice(0, 16)]]))).toMatchObject({ intact: false, matchesChain: false });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => answer(document)));
    expect((await checkCopy(copy, new Map([['html-tags', '0000000000000000']]))).matchesChain).toBe(false);
    expect((await checkCopy(copy, new Map())).matchesChain).toBe(false);
  });

  it('does not compare a picture with the chain, and reports a copy no gateway has', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => answer(document)));
    expect((await checkCopy(await copyOf({ kind: 'image', claim: null }), new Map())).matchesChain).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await checkCopy(await copyOf(), new Map())).toMatchObject({ computed: null, intact: false, from: null });
  });
});

describe('arweaveOwnerOf', () => {
  it('gives the owner address Arweave shows for copies signed by the mint authority', async () => {
    expect(await arweaveOwnerOf('CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B')).toBe('F9rU0NCWph-mFXFK4N3EPJ7SL-8MFzZ9P0MuULg3YWM');
  });
});
