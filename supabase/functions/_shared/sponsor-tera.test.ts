import { describe, expect, it } from 'vitest';
import {
  PRIZE_TOTAL_LAMPORTS,
  cleanBrand,
  paidPrizeFee,
  parsePrizeTera,
  prizeFeeInstruction,
  prizeOf,
  prizeQuote,
  prizeView,
  sponsorArt,
  sponsorAssetName,
  sponsorAttributes,
  sponsorMetadata,
  type PrizeTera,
} from './sponsor-tera';

const PRIZE: PrizeTera = { brand: 'Acme Labs', accent: '#ff8800', base: 'tera_feliz' };
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const FUNDER = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';

describe('the brand a sponsor types', () => {
  it('keeps letters, digits and a few signs; folds compatibility forms and drops invisible characters', () => {
    expect(cleanBrand('Acme Labs')).toBe('Acme Labs');
    expect(cleanBrand('  Café   do   João & Cia.  ')).toBe('Café do João & Cia.');
    expect(cleanBrand('A\u0000c\u001fm\u007fe\u200b \u202eLabs\u2066')).toBe('Acme Labs');
    expect(cleanBrand('Ａｃｍｅ')).toBe('Acme');
    expect(cleanBrand("O'Brien + Sons!")).toBe("O'Brien + Sons!");
    expect(cleanBrand('x'.repeat(24))).toBe('x'.repeat(24));
  });

  it('refuses markup, quotes and emoji outright, a name too short or too long, signs only, and a name posing as the team', () => {
    for (const bad of [
      '', 'A', '<>', '...', '&&&&', '🚀🚀🚀', 'Acme 🚀', '<script>alert(1)</script>', 'Acme"/><image href="https://evil.example/x.png"/>', 'Acme<b>', 'a=b', 'Acme/Labs', 'Acme;', 'x'.repeat(25),
      'Itera', 'i t e r a official', 'DevFellowship', 'Solana Foundation', 'Verified Partner', 'x'.repeat(201), 42, null, undefined, { brand: 'x' },
    ]) {
      expect(cleanBrand(bad)).toBeNull();
    }
  });

  it('KNOWN LIMIT: a look-alike letter from another alphabet passes the reserved-name check', () => {
    // Cyrillic capital I (U+0406) reads as "Itera". The check is a word list, not a confusables table; the art labels every
    // such Tera "SPONSOR TERA · BOUNTY PRIZE" and the metadata says the brand is the sponsor's own text.
    expect(cleanBrand('\u0406tera')).toBe('\u0406tera');
  });

  it('never lets markup reach the art: the brand is escaped again where it is drawn', () => {
    const art = sponsorArt({ prize: { brand: `A&B 'Co'`, accent: '#ff8800', base: 'tera_feliz' }, picture: null, caption: '<b>Build</b> "it" & ship', edition: { number: 1, size: 1 } });
    expect(art).toContain('A&amp;B &#39;Co&#39;');
    expect(art).toContain('&lt;b&gt;Build&lt;/b&gt; &quot;it&quot; &amp; ship');
    expect(art).not.toContain('<b>');
    expect((art.match(/<image/g) ?? []).length).toBe(0);
    expect(art.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });
});

describe('the prize of the posting form', () => {
  it('is optional, and whole or refused', () => {
    expect(parsePrizeTera(undefined)).toEqual({ ok: true, value: null });
    expect(parsePrizeTera(null)).toEqual({ ok: true, value: null });
    expect(parsePrizeTera({ brand: ' Acme  Labs ', accent: '#FF8800', base: 'tera_feliz' })).toEqual({ ok: true, value: PRIZE });
    for (const bad of [
      'Acme',
      [],
      { brand: 'Acme Labs', accent: 'red', base: 'tera_feliz' },
      { brand: 'Acme Labs', accent: '#ff880', base: 'tera_feliz' },
      { brand: 'Acme Labs', accent: '#ff8800"/><script>', base: 'tera_feliz' },
      { brand: 'Acme Labs', accent: '#ff8800', base: 'brand_phoenix_full' },
      { brand: 'Acme Labs', accent: '#ff8800', base: '../../etc/passwd' },
      { brand: '<>', accent: '#ff8800', base: 'tera_feliz' },
      { brand: 'Itera', accent: '#ff8800', base: 'tera_feliz' },
      { accent: '#ff8800', base: 'tera_feliz' },
    ]) {
      expect(parsePrizeTera(bad)).toEqual({ ok: false, error: 'invalid_prize_tera' });
    }
    expect(prizeOf({ brand: '<b>x', accent: '#000000', base: 'tera_normal' })).toBeNull();
    expect(prizeOf(PRIZE)).toEqual(PRIZE);
    expect(prizeOf({ brand: 'Acme', accent: 'url(x)', base: 'tera_normal' })).toBeNull();
  });

  it('draws only a picture the server inlined, in a colour of a fixed alphabet', () => {
    const picture = 'data:image/webp;base64,AAAA';
    expect(sponsorArt({ prize: PRIZE, picture })).toContain(`href="${picture}"`);
    expect(sponsorArt({ prize: PRIZE, picture: 'https://evil.example/x.png' })).not.toContain('evil.example');
    expect(sponsorArt({ prize: PRIZE, picture: 'data:image/svg+xml;base64,AAAA' })).not.toContain('<image');
    const hostile = sponsorArt({ prize: { ...PRIZE, accent: '#fff"/><script>' }, picture: null });
    expect(hostile).not.toContain('<script');
    expect(hostile).toContain('#3fd17f');
    expect(sponsorArt({ prize: PRIZE, picture: null })).toContain('PREVIEW');
    expect(sponsorArt({ prize: PRIZE, picture: null, edition: { number: 1, size: 1 } })).toContain('#1 OF 1');
  });
});

describe('what the sponsor pays and what the asset says', () => {
  it('quotes the mint cost and the issuing fee, and builds one transfer to the treasury for both', () => {
    expect(prizeQuote()).toEqual({ mint_lamports: 4_000_000, fee_lamports: 10_000_000, total_lamports: 14_000_000 });
    const instruction = prizeFeeInstruction(FUNDER, TREASURY);
    expect(instruction.accounts).toEqual([{ address: FUNDER, signer: true, writable: true }, { address: TREASURY, writable: true }]);
    expect(new DataView(instruction.data.buffer).getUint32(0, true)).toBe(2);
    expect(new DataView(instruction.data.buffer).getBigUint64(4, true)).toBe(PRIZE_TOTAL_LAMPORTS);
  });

  it('counts the fee as paid only when the funding transaction succeeded and the treasury rose by the total', () => {
    const tx = (rise: number, err: unknown = null) => ({ meta: { err, preBalances: [5_000_000_000, 1_000], postBalances: [4_000_000_000, 1_000 + rise] }, transaction: { message: { accountKeys: [FUNDER, TREASURY] } } });
    expect(paidPrizeFee(tx(14_000_000), TREASURY)).toBe(true);
    expect(paidPrizeFee(tx(20_000_000), TREASURY)).toBe(true);
    expect(paidPrizeFee(tx(13_999_999), TREASURY)).toBe(false);
    expect(paidPrizeFee(tx(14_000_000, { InstructionError: [0, 'Custom'] }), TREASURY)).toBe(false);
    expect(paidPrizeFee(tx(14_000_000), FUNDER)).toBe(false);
    expect(paidPrizeFee({ meta: null, transaction: { message: { accountKeys: [TREASURY] } } }, TREASURY)).toBe(false);
    expect(paidPrizeFee(null, TREASURY)).toBe(false);
  });

  it('writes the origin, the brand, the bounty and the payout on the asset', () => {
    const attributes = sponsorAttributes({ prize: PRIZE, edition: 1, editionSize: 1, wallet: FUNDER, bountyId: '11111111-1111-4111-8111-111111111111', payoutSignature: 'SIG' });
    expect(Object.fromEntries(attributes.map(({ key, value }) => [key, value]))).toEqual({
      kind: 'avatar', key: 'tera_feliz', rarity: 'sponsor', tier: 'Sponsor Tera', serial: '1', supply_cap: '1', origin: 'sponsor', brand: 'Acme Labs', accent: '#ff8800',
      learner: FUNDER, bounty: '11111111-1111-4111-8111-111111111111', payout_tx: 'SIG',
    });
    expect(sponsorAssetName(PRIZE, 1)).toBe('Acme Labs · Sponsor Tera #1');
    const meta = sponsorMetadata({ prize: PRIZE, edition: 1, editionSize: 1, asset: 'Asset111', imageUrl: 'https://x/image.svg', bountyTitle: 'Build a card', bountySlug: 'build-a-card-abc123', payoutSignature: 'SIG' });
    expect(meta.attributes).toEqual(expect.arrayContaining([{ trait_type: 'Origin', value: 'sponsor' }, { trait_type: 'Transferable', value: 'no' }, { trait_type: 'Brand', value: 'Acme Labs' }, { trait_type: 'Edition', value: '1 of 1' }]));
    expect(meta.description).toContain('Soulbound');
  });

  it('shows the prize on a bounty: the preview until it is minted, then the asset', () => {
    expect(prizeView({ prize: null, functionsBase: 'https://f', issued: 0, funded: false, asset: null, rowId: null })).toBeNull();
    const before = prizeView({ prize: PRIZE, functionsBase: 'https://f', issued: 0, funded: true, asset: null, rowId: null });
    expect(before).toMatchObject({ brand: 'Acme Labs', accent: '#ff8800', base: 'tera_feliz', issued: 0, funded: true, transferable: false, asset: null, total_lamports: 14_000_000 });
    expect(before?.image_url).toBe('https://f/credential-meta/sponsor-preview.svg?brand=Acme+Labs&accent=%23ff8800&base=tera_feliz');
    const after = prizeView({ prize: PRIZE, functionsBase: 'https://f', issued: 1, funded: true, asset: 'Asset111', rowId: 'row-1' });
    expect(after).toMatchObject({ issued: 1, asset: 'Asset111', image_url: 'https://f/credential-meta/sponsor/row-1/image.svg' });
    expect(after?.page_url).toContain('/c/Asset111');
  });
});
