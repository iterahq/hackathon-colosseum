import { describe, expect, it } from 'vitest';
import { base58Encode, hex, looksLikeAddress, sha256Hex } from '@/lib/chain/base58';
import { attributeOf, parseCoreAsset } from '@/lib/chain/coreAsset';
import { ESCROW_LAYOUT, ESCROW_STATE_BYTES, parseEscrowAccount } from '@/lib/chain/escrowAccount';
import { ASSET_BASE64, ESCROW_BASE64, PROGRAM_BASE64, PROGRAM_DATA_HEADER_BASE64 } from '@/lib/chain/fixtures';
import { parseProgramDataHeader, programDataAddress } from '@/lib/chain/programData';
import { curlFor } from '@/lib/chain/rpc';

const bytes = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

describe('parseCoreAsset (a real certification from devnet)', () => {
  const asset = parseCoreAsset(bytes(ASSET_BASE64));

  it('reads the owner, the collection, the name and the uri', () => {
    expect(asset?.owner).toBe('78jLEGdjmyETAe9xd5gLq8YJ6L1DScQ9N8Gkgp1YPh87');
    expect(asset?.collection).toBe('Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b');
    expect(asset?.updateAuthority).toBeNull();
    expect(asset?.name).toBe('Tera Certification · Week 1 · HTML');
    expect(asset?.uri).toMatch(/^https:\/\/.+\/credential-meta\//);
  });

  it('finds the plugin that makes it soulbound, and the byte that says frozen', () => {
    expect(asset?.frozen).toBe(true);
    expect(asset?.frozenBy).toEqual({ plugin: 'PermanentFreezeDelegate', offset: 227 });
    expect(bytes(ASSET_BASE64)[227]).toBe(1);
    expect(asset?.plugins.map((plugin) => plugin.name)).toEqual(['PermanentFreezeDelegate', 'Attributes']);
  });

  it('reads the stamped days and the claim hashes out of the attributes', () => {
    expect(asset && attributeOf(asset, 'days_done')).toBe('3');
    expect(asset && attributeOf(asset, 'trail')).toBe('Week 1 · HTML');
    expect(asset && attributeOf(asset, 'claim:html-skeleton')).toBe('59ab5b6cdb2f4b5b');
    expect(asset && attributeOf(asset, 'nope')).toBeNull();
  });

  it('answers null for bytes that are not an asset', () => {
    expect(parseCoreAsset(bytes(ESCROW_BASE64))).toBeNull();
    expect(parseCoreAsset(new Uint8Array())).toBeNull();
    expect(parseCoreAsset(bytes(ASSET_BASE64).subarray(0, 60))).toBeNull();
  });
});

describe('parseEscrowAccount (a real bounty escrow from devnet)', () => {
  it('reads the state the program wrote', () => {
    expect(parseEscrowAccount(bytes(ESCROW_BASE64))).toEqual({
      status: 'open',
      bountyId: '537f05d1-2f95-4963-b61f-c86c274521f0',
      sponsor: 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA',
      approver: 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA',
      collection: 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b',
      lamports: 30_000_000n,
      expiresAt: 1793510528,
      claimant: null,
      certification: null,
    });
  });

  it('names a claimant when the status byte and the key are set', () => {
    const data = bytes(ESCROW_BASE64);
    data[2] = 1;
    data.set(new Uint8Array(32).fill(7), 131);
    const state = parseEscrowAccount(data);
    expect(state?.status).toBe('claimed');
    expect(state?.claimant).toBe(base58Encode(new Uint8Array(32).fill(7)));
  });

  it('answers null for another length, another tag, an unknown status', () => {
    expect(parseEscrowAccount(bytes(ASSET_BASE64))).toBeNull();
    const data = bytes(ESCROW_BASE64);
    data[2] = 9;
    expect(parseEscrowAccount(data)).toBeNull();
  });

  it('documents a layout that covers the whole account', () => {
    const last = ESCROW_LAYOUT[ESCROW_LAYOUT.length - 1];
    expect(last.offset + last.length).toBe(ESCROW_STATE_BYTES);
    ESCROW_LAYOUT.slice(1).forEach((entry, index) => expect(entry.offset).toBe(ESCROW_LAYOUT[index].offset + ESCROW_LAYOUT[index].length));
  });
});

describe('the escrow program accounts', () => {
  it('follows the program account to its data account, and reads who may replace the code', () => {
    expect(programDataAddress(bytes(PROGRAM_BASE64))).toBe('JAuH2WXV64vMHVVGsL8pZaTSvDEiSzrqbXmnx8FGHT84');
    expect(parseProgramDataHeader(bytes(PROGRAM_DATA_HEADER_BASE64))).toEqual({ lastDeployedSlot: 509884700, upgradeAuthority: 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B' });
  });

  it('reads a final program as having no upgrade authority', () => {
    const data = bytes(PROGRAM_DATA_HEADER_BASE64);
    data[12] = 0;
    expect(parseProgramDataHeader(data)?.upgradeAuthority).toBeNull();
    expect(parseProgramDataHeader(data.subarray(0, 10))).toBeNull();
    expect(programDataAddress(bytes(ESCROW_BASE64))).toBeNull();
  });
});

describe('helpers', () => {
  it('hashes text the way the evidence hash is made', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(Uint8Array.of(0, 255, 16))).toBe('00ff10');
  });

  it('tells an address from other text', () => {
    expect(looksLikeAddress('78jLEGdjmyETAe9xd5gLq8YJ6L1DScQ9N8Gkgp1YPh87')).toBe(true);
    expect(looksLikeAddress('not an address')).toBe(false);
    expect(looksLikeAddress('0OIl')).toBe(false);
  });

  it('writes a curl line anyone can paste', () => {
    expect(curlFor('getAccountInfo', ['abc', { encoding: 'base64' }])).toBe(
      `curl -s https://api.devnet.solana.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["abc",{"encoding":"base64"}]}'`,
    );
  });
});
