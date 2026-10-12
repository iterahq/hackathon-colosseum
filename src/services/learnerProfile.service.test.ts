import { describe, expect, it } from 'vitest';
import { parseEvidence, parseJourney, parseProfile } from '@/services/learnerProfile.service';

const body = {
  wallet: 'W1',
  verified_count: 3,
  companion: { asset: 'C1', verified: true, lives: 3, max_lives: 5, outfit: 'outfit_crown', level: 4, xp: 780, streak: 2, image_url: 'c.svg', explorer_url: 'e' },
  certifications: [{ asset: 'A1', verified: true, trail: 'HTML', trail_title: { pt: 'HTML pt', en: 'HTML en' }, days_done: 4, total_days: 5, tier: 'bronze', ink: 'emerald', frame: null, image_url: 'a.svg', page_url: '/c/A1' }, { verified: true }],
  medals: [{ asset: 'M1', verified: true, key: 'first_stamp', title: 'First stamp', image_url: 'm.svg' }],
};

describe('parseProfile', () => {
  it('maps the wire shape and picks the trail title in the language', () => {
    const p = parseProfile(body, 'W1', 'en');
    expect(p.verifiedCount).toBe(3);
    expect(p.companion).toMatchObject({ asset: 'C1', lives: 3, maxLives: 5, outfit: 'outfit_crown', level: 4 });
    expect(p.certifications).toHaveLength(1);
    expect(p.certifications[0]).toMatchObject({ trail: 'HTML en', daysDone: 4, totalDays: 5, ink: 'emerald', frame: null });
    expect(p.medals[0]).toMatchObject({ asset: 'M1', title: 'First stamp' });
  });
  it('an unknown wallet is an empty profile', () => {
    const p = parseProfile({ wallet: 'W2', companion: null, certifications: [], medals: [] }, 'W2', 'pt');
    expect(p).toMatchObject({ companion: null, certifications: [], medals: [], verifiedCount: 0 });
  });
});

describe('parseCapabilities', () => {
  const caps = {
    program: 'itera-v2', version: 1, total: 2, verified_count: 1, next: 'b',
    trails: [{ trail: 0, title: 'Week 1' }],
    nodes: [
      { id: 'a', trail: 0, day: 1, title: 'A', requires: [], status: 'verified', proof: { asset: 'AS', attribute: 'claim:a', onchain_value: 'abcd', evidence_hash: 'abcd'.padEnd(64, '0'), tx_signature: 'sig', proven_at: '2026-10-11T00:00:00Z', asset_explorer_url: 'u1', tx_explorer_url: 'u2' } },
      { id: 'b', trail: 0, day: 2, title: 'B', requires: ['a'], status: 'weird', proof: { asset: 'x' } },
      { title: 'no id' },
    ],
  };

  it('maps nodes and proofs to camelCase and drops malformed nodes', () => {
    const c = parseProfile({ capabilities: caps }, 'W', 'en').capabilities;
    expect(c).toMatchObject({ total: 2, verifiedCount: 1, next: 'b', program: 'itera-v2' });
    expect(c?.nodes).toHaveLength(2);
    expect(c?.nodes[0].proof).toMatchObject({ asset: 'AS', attribute: 'claim:a', onchainValue: 'abcd', txSignature: 'sig', assetExplorerUrl: 'u1' });
  });

  it('an unknown status is open and carries no proof', () => {
    const c = parseProfile({ capabilities: caps }, 'W', 'en').capabilities;
    expect(c?.nodes[1]).toMatchObject({ status: 'open', proof: null, requires: ['a'] });
  });

  it('a missing or empty capabilities block is null', () => {
    expect(parseProfile({}, 'W', 'en').capabilities).toBeNull();
    expect(parseProfile({ capabilities: { nodes: [] } }, 'W', 'en').capabilities).toBeNull();
    expect(parseProfile({ capabilities: 'x' }, 'W', 'en').capabilities).toBeNull();
  });
});

describe('parseEvidence', () => {
  it('reads the evidence envelope and rejects an incomplete one', () => {
    expect(parseEvidence({ wallet: 'W', claim: 'a', lesson_id: 'L', evidence: '{}', evidence_hash: 'h', tx_signature: 's', tx_explorer_url: 'u' })).toMatchObject({ claim: 'a', lessonId: 'L', evidence: '{}', evidenceHash: 'h' });
    expect(parseEvidence({ wallet: 'W' })).toBeNull();
  });
});

describe('parseJourney', () => {
  it('keeps verdicts, modes and counts, and nothing else the answer carries', () => {
    const journey = parseJourney({
      wallet: 'W',
      claim: 'html-tags',
      answer: 'secret',
      activities: [
        { mode: 'server', verdicts: [false, true], tries: 2, answer_hash: 'secret', activity_id: 'secret' },
        { mode: 'self_reported', verdicts: [true], tries: 1 },
        { mode: 'server', verdicts: [], tries: 0 },
        { mode: 'server', verdicts: [false, 'yes', true], tries: 9 },
      ],
      tries: 999,
      first_try: 999,
    });
    expect(journey).toEqual({
      activities: [
        { mode: 'server', verdicts: [false, true], tries: 2 },
        { mode: 'self_reported', verdicts: [true], tries: 1 },
        { mode: 'server', verdicts: [false, false, true], tries: 9 },
      ],
      tries: 12,
      firstTry: 1,
    });
  });

  it('reads a private stub or a malformed answer as an empty track', () => {
    expect(parseJourney({ wallet: 'W', private: true, claim: 'html-tags' })).toEqual({ activities: [], tries: 0, firstTry: 0 });
    expect(parseJourney(null)).toEqual({ activities: [], tries: 0, firstTry: 0 });
  });
});

describe('the share of a proof', () => {
  const proof = { asset: 'AS', attribute: 'claim:a', evidence_hash: 'abcd'.padEnd(64, '0') };
  const first = (extra: Record<string, unknown>) => parseProfile({ capabilities: { nodes: [{ id: 'a', title: 'A', status: 'verified', proof: { ...proof, ...extra } }] } }, 'W', 'en').capabilities?.nodes[0].proof;

  it('tells a stated share, a stated absence and an answer that did not look apart', () => {
    expect(first({ graded: '10/12' })?.graded).toBe('10/12');
    expect(first({ graded: null })?.graded).toBeNull();
    expect(first({})).not.toHaveProperty('graded');
  });
});
