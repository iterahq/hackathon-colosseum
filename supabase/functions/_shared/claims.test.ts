import { describe, expect, it } from 'vitest';
import { ITERA_V2_GRAPH, claimsOfDay, nextClaim } from './capability-graph';
import {
  ATTRIBUTE_BUDGET_BYTES,
  attributeBytes,
  buildGraph,
  claimAttributes,
  claimsOf,
  evidenceDocument,
  expectedClaims,
  graphProofs,
  hasUnwrittenClaims,
  onchainClaims,
  sha256Hex,
  withClaims,
  type ProvenClaim,
} from './claims';
import { onchainAttributes, type AchievementRow, type CatalogEntry } from './credential';
import { planMintJobs } from './mint-plan';

const WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const hashOf = (seed: string) => seed.repeat(64).slice(0, 64);
const catalog: CatalogEntry = { key: 'trail_pass', kind: 'trail', tier: 'bronze', title_i18n: { en: 'Certification' }, description_i18n: {}, art: {} };

function passport(state: Record<string, unknown>, overrides: Partial<AchievementRow> = {}): AchievementRow {
  return {
    id: 'row-1',
    user_id: 'user-1',
    achievement_key: 'trail_pass',
    ref_id: 'unit-0',
    state: { program_slug: 'itera-v2', trail_title: { en: 'Week 3 · JavaScript', pt: 'Semana 3 · JavaScript' }, days_done: 5, total_days: 5, tier: 'gold', completed_at: '2026-10-10T12:00:00.000Z', ...state },
    earned_at: '2026-10-09T12:00:00.000Z',
    mint_status: 'minted',
    wallet_address: WALLET,
    asset_address: 'Asset1111111111111111111111111111111111111',
    tx_signature: 'sig',
    minted_at: '2026-10-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('the itera-v2 capability graph', () => {
  const ids = ITERA_V2_GRAPH.claims.map((entry) => entry.id);

  it('has unique, chain-safe ids and both languages', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ITERA_V2_GRAPH.claims) {
      expect(entry.id).toMatch(/^[a-z0-9-]{1,14}$/);
      expect(entry.title.en.length).toBeGreaterThan(10);
      expect(entry.title.pt.length).toBeGreaterThan(10);
    }
  });

  it('is a DAG whose edges only point to earlier days', () => {
    const position = new Map(ITERA_V2_GRAPH.claims.map((entry) => [entry.id, entry.trail * 10 + entry.day]));
    for (const entry of ITERA_V2_GRAPH.claims) {
      for (const required of entry.requires) {
        expect(position.has(required), `${entry.id} requires unknown ${required}`).toBe(true);
        expect(ids.indexOf(required)).toBeLessThan(ids.indexOf(entry.id));
        expect(position.get(required) as number).toBeLessThanOrEqual(position.get(entry.id) as number);
      }
    }
  });

  it('gives every one of the 15 days at least one claim', () => {
    for (let trail = 0; trail < 3; trail += 1) {
      for (let day = 1; day <= 5; day += 1) expect(claimsOfDay(ITERA_V2_GRAPH, trail, day).length).toBeGreaterThan(0);
    }
  });

  it('names the next claim whose prerequisites are proven', () => {
    expect(nextClaim(ITERA_V2_GRAPH, new Set())?.id).toBe('html-tags');
    expect(nextClaim(ITERA_V2_GRAPH, new Set(['html-tags', 'html-skeleton']))?.id).toBe('html-nesting');
    expect(nextClaim(ITERA_V2_GRAPH, new Set(ids))).toBeNull();
  });
});

describe('evidence', () => {
  const input = { claim: 'html-tags', program: 'itera-v2', wallet: WALLET, lessonId: 'lesson-1', activities: [{ id: 'b', completed_at: '2026-10-10T10:00:05.000Z' }, { id: 'a', completed_at: '2026-10-10T10:00:01.000Z' }] };

  it('is the same document whatever order the activities arrive in', () => {
    expect(evidenceDocument(input)).toBe(evidenceDocument({ ...input, activities: [...input.activities].reverse() }));
    expect(JSON.parse(evidenceDocument(input))).toEqual({
      v: 1,
      issuer: 'itera',
      claim: 'html-tags',
      program: 'itera-v2',
      wallet: WALLET,
      lesson_id: 'lesson-1',
      completed_at: '2026-10-10T10:00:05.000Z',
      activities: [['a', '2026-10-10T10:00:01.000Z'], ['b', '2026-10-10T10:00:05.000Z']],
    });
  });

  it('hashes differently for another wallet or another claim', async () => {
    const base = await sha256Hex(evidenceDocument(input));
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(evidenceDocument({ ...input, wallet: '11111111111111111111111111111111' }))).not.toBe(base);
    expect(await sha256Hex(evidenceDocument({ ...input, claim: 'html-skeleton' }))).not.toBe(base);
  });
});

describe('claims in a certification row', () => {
  const claims: ProvenClaim[] = [{ id: 'html-tags', hash: hashOf('a'), tx: 'sig1' }, { id: 'html-skeleton', hash: hashOf('b'), tx: null }];

  it('reads only well-formed claims', () => {
    expect(claimsOf({ claims: [...claims, { id: 'html-tags', hash: hashOf('c') }, { id: 'BAD ID', hash: hashOf('c') }, { id: 'x', hash: 'short' }, null] })).toEqual(claims);
    expect(claimsOf({})).toEqual([]);
  });

  it('follows the table of record', () => {
    const row = passport({});
    expect(withClaims(row, [])).toBe(row);
    const withBoth = withClaims(row, claims);
    expect(claimsOf(withBoth.state)).toEqual(claims);
    expect(withClaims(withBoth, claims)).toBe(withBoth);
    expect(claimsOf(withClaims(withBoth, []).state)).toEqual([]);
    expect(hasUnwrittenClaims(withBoth.state)).toBe(true);
    expect(hasUnwrittenClaims(withClaims(row, [claims[0]]).state)).toBe(false);
  });

  it('writes one attribute per claim after the existing ones', () => {
    const attributes = onchainAttributes(passport({ claims }), catalog);
    expect(attributes.slice(-2)).toEqual([
      { key: 'claim:html-tags', value: hashOf('a').slice(0, 16) },
      { key: 'claim:html-skeleton', value: hashOf('b').slice(0, 16) },
    ]);
    expect(attributes.find(({ key }) => key === 'days_done')?.value).toBe('5');
    expect(onchainAttributes(passport({}), catalog).some(({ key }) => key.startsWith('claim:'))).toBe(false);
    expect([...onchainClaims(attributes)]).toEqual([['html-tags', hashOf('a').slice(0, 16)], ['html-skeleton', hashOf('b').slice(0, 16)]]);
  });

  it('fits the most crowded certification of every trail in one transaction', () => {
    const endorsements = [1, 2, 3].map((slot) => ({ slot, wallet: WALLET, at: '2026-10-10T12:00:00.000Z' }));
    for (let trail = 0; trail < 3; trail += 1) {
      const all = ITERA_V2_GRAPH.claims.filter((entry) => entry.trail === trail).map((entry) => ({ id: entry.id, hash: hashOf('f'), tx: null }));
      const crowded = onchainAttributes(passport({ claims: all, endorsements, cosmetics: { ink: 'emerald', frame: 'gold-leaf' } }), catalog);
      expect(attributeBytes(crowded)).toBeLessThanOrEqual(ATTRIBUTE_BUDGET_BYTES);
      expect(onchainClaims(crowded).size).toBe(all.length);
      const plain = onchainAttributes(passport({ claims: all }), catalog);
      expect([...onchainClaims(plain).values()].every((value) => value.length === 16)).toBe(true);
    }
  });

  it('shortens the hash prefix on a crowded asset and refuses what cannot fit', () => {
    const filler = [{ key: 'x', value: 'y'.repeat(ATTRIBUTE_BUDGET_BYTES - 42) }];
    expect(claimAttributes([claims[0]], filler)[0].value).toHaveLength(8);
    expect(() => claimAttributes(claims, [{ key: 'x', value: 'y'.repeat(ATTRIBUTE_BUDGET_BYTES) }])).toThrow(/do not fit/);
  });

  it('plans one update for a minted certification whose claims are not on chain', () => {
    const medals = new Set<string>();
    expect(planMintJobs([passport({ claims: [claims[0]] })], medals)).toEqual([]);
    const row = passport({ claims });
    expect(planMintJobs([row], medals)).toEqual([{ type: 'update_passport', anchor: row, rows: [] }]);
  });
});

describe('expectedClaims', () => {
  it('lists the claims of the stamped days with the lesson that proved each', () => {
    const state = { program_slug: 'itera-v2', stamped_days: [2, 1], stamped_lesson_ids: ['lesson-2', 'lesson-1'] };
    expect(expectedClaims(state, 0).map(({ claim, lessonId }) => [claim.id, lessonId])).toEqual([
      ['html-tags', 'lesson-1'],
      ['html-skeleton', 'lesson-1'],
      ['html-nesting', 'lesson-2'],
      ['html-attrs', 'lesson-2'],
    ]);
    expect(expectedClaims({ ...state, program_slug: 'other' }, 0)).toEqual([]);
    expect(expectedClaims({ ...state, stamped_lesson_ids: ['lesson-2'] }, 0)).toEqual([]);
  });
});

describe('the graph of a wallet', () => {
  const rows = [{ id: 'row-1', achievement_key: 'trail_pass', asset_address: 'asset-1' }];
  const proofs = [
    { user_achievement_id: 'row-1', claim_id: 'html-tags', evidence_hash: hashOf('a'), tx_signature: 'sig1', proven_at: '2026-10-10T12:00:00Z' },
    { user_achievement_id: 'row-1', claim_id: 'html-skeleton', evidence_hash: hashOf('b'), tx_signature: null, proven_at: '2026-10-10T12:00:00Z' },
    { user_achievement_id: 'row-1', claim_id: 'html-nesting', evidence_hash: hashOf('c'), tx_signature: 'sig2', proven_at: '2026-10-10T12:00:00Z' },
  ];
  const onchain = [
    { key: 'days_done', value: '2' },
    { key: 'claim:html-tags', value: hashOf('a').slice(0, 12) },
    { key: 'claim:html-nesting', value: 'deadbeefdeadbeef' },
  ];
  const explorer = (type: 'address' | 'tx', value: string | null) => (value ? `https://explorer/${type}/${value}` : null);
  const graph = (verified: boolean) =>
    buildGraph({
      graph: ITERA_V2_GRAPH,
      lang: 'pt',
      trails: [{ trail: 0, title: 'Semana 1 · HTML' }],
      proofs: graphProofs({ rows, proofs, attributesOf: () => onchain, isVerified: () => verified }),
      explorer,
    });

  it('lights a node only when the chain value is a prefix of the evidence hash', () => {
    const view = graph(true);
    const status = Object.fromEntries(view.nodes.map((node) => [node.id, node.status]));
    expect(status['html-tags']).toBe('verified');
    expect(status['html-skeleton']).toBe('recorded');
    expect(status['html-nesting']).toBe('recorded');
    expect(status['html-attrs']).toBe('open');
    expect(view.verified_count).toBe(1);
    expect(view.total).toBe(ITERA_V2_GRAPH.claims.length);
    expect(view.next).toBe('html-attrs');
    const tags = view.nodes.find((node) => node.id === 'html-tags');
    expect(tags?.title).toBe('Lê HTML e separa as tags do conteúdo');
    expect(tags?.proof).toMatchObject({ asset: 'asset-1', attribute: 'claim:html-tags', onchain_value: hashOf('a').slice(0, 12), tx_explorer_url: 'https://explorer/tx/sig1', asset_explorer_url: 'https://explorer/address/asset-1' });
  });

  it('verifies nothing from an asset that failed verification', () => {
    const view = graph(false);
    expect(view.verified_count).toBe(0);
    expect(view.nodes.find((node) => node.id === 'html-tags')?.status).toBe('recorded');
  });

  it('answers an all-open graph for a wallet with nothing', () => {
    const view = buildGraph({ graph: ITERA_V2_GRAPH, lang: 'en', trails: [], proofs: new Map(), explorer });
    expect(view.nodes.every((node) => node.status === 'open' && node.proof === null)).toBe(true);
    expect(view.next).toBe('html-tags');
  });
});
