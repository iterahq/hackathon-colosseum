import { describe, expect, it } from 'vitest';
import {
  TRANSFER_LEASE_MS,
  boardStats,
  bountyActionCompleted,
  bountyActionGet,
  bountyActionPost,
  bountyView,
  checkEligibility,
  drainLamports,
  earningsView,
  fundingCost,
  fundingTarget,
  parseNewBounty,
  parseSubmission,
  publicStatus,
  trailAttribute,
  transferMemo,
  transferStep,
  type BountyRow,
  type ClaimRow,
  type Requirement,
} from './bounty';
import type { OnchainAsset } from './profile';

const WALLET = 'DnwhpnR3SYHst64vZFdTLAhfGcAQzZFzGGhivt4CmxWg';
const OTHER = '6BZtJTz2TExt4BYxAbwS4gAJMrK7XdEx1Man2vQEmxJp';
const COLLECTION = 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b';
const AUTHORITY = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const NOW = new Date('2026-10-11T12:00:00Z');

const requirement: Requirement = {
  program: 'itera-v2',
  unit_id: '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d',
  trail: 'Week 1 · HTML',
  trail_title: { pt: 'Semana 1 · HTML', en: 'Week 1 · HTML' },
  min_days: 3,
  total_days: 5,
};

function asset(overrides: Partial<OnchainAsset> & { days?: number; trail?: string; program?: string; kind?: string } = {}): OnchainAsset {
  const { days = 3, trail = 'Week 1 · HTML', program = 'itera-v2', kind = 'trail_passport', ...rest } = overrides;
  return {
    address: 'HpTfPk5y4XY2XwATN5F8m3eJN7i9ScVPUUzHLP63P8E3',
    owner: WALLET,
    frozen: true,
    collection: COLLECTION,
    update_authority: AUTHORITY,
    attributes: [
      { key: 'kind', value: kind },
      { key: 'program', value: program },
      { key: 'trail', value: trail },
      { key: 'days_done', value: String(days) },
    ],
    ...rest,
  };
}

const check = (assets: OnchainAsset[], wallet: string | null = WALLET) =>
  checkEligibility({ wallet, requirement, assets, collection: COLLECTION, authority: AUTHORITY });

function bounty(overrides: Partial<BountyRow> = {}): BountyRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'semantic-landing',
    tenant_id: 'fe02614d-0934-40fa-96ed-1f1f63366290',
    sponsor_name: 'DevFellowship',
    title_i18n: { pt: 'Página semântica', en: 'Semantic page' },
    summary_i18n: { pt: 'Resumo', en: 'Summary' },
    brief_i18n: { pt: 'Tarefa', en: 'Task' },
    deliverable_i18n: { pt: 'Link', en: 'Link' },
    requirement,
    reward_lamports: 20_000_000,
    escrow_kind: 'derived_account',
    escrow_address: OTHER,
    refund_address: AUTHORITY,
    status: 'open',
    claim_id: null,
    claim_hours: 72,
    expires_at: '2026-11-01T00:00:00Z',
    funded_at: '2026-10-11T00:00:00Z',
    funded_lamports: 20_005_000,
    funding_signature: 'fundsig',
    transfer_signature: null,
    transfer_sent_at: null,
    transfer_lamports: null,
    paid_at: null,
    paid_wallet: null,
    payout_lamports: null,
    payout_signature: null,
    refunded_at: null,
    refund_lamports: null,
    refund_signature: null,
    created_at: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

const claim: ClaimRow = {
  id: '22222222-2222-4222-8222-222222222222',
  bounty_id: '11111111-1111-4111-8111-111111111111',
  user_id: '33333333-3333-4333-8333-333333333333',
  wallet: WALLET,
  proof_asset: 'HpTfPk5y4XY2XwATN5F8m3eJN7i9ScVPUUzHLP63P8E3',
  proof: { days_done: 3 },
  status: 'submitted',
  accepted_at: '2026-10-11T01:00:00Z',
  deadline_at: '2026-10-14T01:00:00Z',
  submission_url: 'https://example.com/work',
  submission_note: 'done',
  submitted_at: '2026-10-11T02:00:00Z',
  reviewed_at: null,
  review_note: 'internal note',
};

describe('checkEligibility', () => {
  it('accepts a wallet whose on-chain certification has the required days', () => {
    expect(check([asset()])).toEqual({
      eligible: true,
      reason: null,
      proof: { asset: 'HpTfPk5y4XY2XwATN5F8m3eJN7i9ScVPUUzHLP63P8E3', days_done: 3, explorer_url: 'https://explorer.solana.com/address/HpTfPk5y4XY2XwATN5F8m3eJN7i9ScVPUUzHLP63P8E3?cluster=devnet' },
    });
  });

  it('refuses a caller with no wallet', () => {
    expect(check([asset()], null)).toEqual({ eligible: false, reason: 'no_wallet', proof: null });
  });

  it('refuses a wallet with no certification', () => {
    expect(check([])).toMatchObject({ eligible: false, reason: 'no_certification' });
  });

  it.each([
    ['held by another wallet', asset({ owner: OTHER })],
    ['from a foreign collection', asset({ collection: OTHER })],
    ['under a foreign authority', asset({ update_authority: OTHER })],
    ['not soulbound', asset({ frozen: false })],
    ['of another trail', asset({ trail: 'Week 2 · CSS' })],
    ['of another program', asset({ program: 'other' })],
    ['that is a medal', asset({ kind: 'streak_medal' })],
  ])('ignores a certification %s', (_, candidate) => {
    expect(check([candidate])).toMatchObject({ eligible: false, reason: 'no_certification', proof: null });
  });

  it('refuses too few stamped days and says how many the chain shows', () => {
    expect(check([asset({ days: 2 })])).toMatchObject({ eligible: false, reason: 'not_enough_days', proof: { days_done: 2 } });
  });

  it('reads a malformed days_done as zero', () => {
    const forged = asset();
    forged.attributes = forged.attributes.map((entry) => (entry.key === 'days_done' ? { key: 'days_done', value: '99999999999' } : entry));
    expect(check([forged])).toMatchObject({ eligible: false, reason: 'not_enough_days', proof: { days_done: 0 } });
  });

  it('uses the best matching certification', () => {
    expect(check([asset({ days: 1 }), asset({ days: 5, address: OTHER })])).toMatchObject({ eligible: true, proof: { asset: OTHER, days_done: 5 } });
  });
});

describe('escrow amounts', () => {
  it('asks for the reward plus the fee of the one transfer out', () => {
    expect(fundingTarget(20_000_000)).toBe(20_005_000n);
  });

  it('drains the account to zero', () => {
    expect(drainLamports(20_005_000n)).toBe(20_000_000n);
    expect(drainLamports(5_000n)).toBeNull();
    expect(drainLamports(0n)).toBeNull();
  });

  it('labels each transfer of a bounty', () => {
    expect(transferMemo('abc', 'payout')).toBe('itera-bounty:abc:payout');
  });
});

describe('transferStep', () => {
  const recent = new Date(NOW.getTime() - 10_000).toISOString();
  const old = new Date(NOW.getTime() - TRANSFER_LEASE_MS - 1).toISOString();

  it.each([
    ['a landed signature settles', { signature: 's', fate: 'landed', sentAt: recent }, 'settled'],
    ['a signature in flight waits', { signature: 's', fate: 'in_flight', sentAt: old }, 'wait'],
    ['a failed signature is sent again', { signature: 's', fate: 'failed', sentAt: recent }, 'send'],
    ['an unknown signature waits while it may still land', { signature: 's', fate: 'unknown', sentAt: recent }, 'wait'],
    ['an unknown signature is sent again after the window', { signature: 's', fate: 'unknown', sentAt: old }, 'send'],
    ['a fresh lease with nothing broadcast waits', { signature: null, fate: null, sentAt: recent }, 'wait'],
    ['a dead lease is taken over', { signature: null, fate: null, sentAt: old }, 'send'],
    ['a first attempt sends', { signature: null, fate: null, sentAt: null }, 'send'],
  ] as const)('%s', (_, facts, expected) => {
    expect(transferStep({ ...facts, now: NOW })).toBe(expected);
  });
});

describe('publicStatus', () => {
  it('shows an unclaimed bounty past its date as expired', () => {
    expect(publicStatus({ status: 'open', expires_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('expired');
    expect(publicStatus({ status: 'awaiting_funding', expires_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('expired');
  });

  it('keeps a delivered bounty reviewable past its date', () => {
    expect(publicStatus({ status: 'submitted', expires_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('submitted');
    expect(publicStatus({ status: 'open', expires_at: '2026-11-01T00:00:00Z' }, NOW)).toBe('open');
  });
});

describe('parseNewBounty', () => {
  const body = {
    slug: 'semantic-landing',
    sponsor_name: 'DevFellowship',
    title: { pt: 'Página semântica', en: 'Semantic page' },
    summary: { pt: 'Um resumo curto da missão.', en: 'A short summary of it.' },
    brief: { pt: 'Descrição longa o bastante da tarefa.', en: 'A long enough description of the task.' },
    deliverable: { pt: 'Link público', en: 'Public link' },
    reward_lamports: 20_000_000,
    unit_id: '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d',
    min_days: 3,
    expires_in_days: 14,
  };

  it('accepts a complete form', () => {
    const parsed = parseNewBounty(body, NOW);
    expect(parsed).toMatchObject({ ok: true, value: { slug: 'semantic-landing', claim_hours: 72, expires_at: '2026-10-25T12:00:00.000Z', refund_address: null } });
  });

  it.each([
    ['invalid_slug', { slug: 'Bad Slug' }],
    ['invalid_text', { title: { pt: 'Só português' } }],
    ['invalid_reward', { reward_lamports: 999 }],
    ['invalid_reward', { reward_lamports: 600_000_000 }],
    ['invalid_reward', { reward_lamports: '20000000' }],
    ['invalid_requirement', { min_days: 0 }],
    ['invalid_deadline', { expires_in_days: 0 }],
    ['invalid_refund_address', { refund_address: '11111111111111111111111111111111' }],
  ])('answers %s', (error, change) => {
    expect(parseNewBounty({ ...body, ...change }, NOW)).toEqual({ ok: false, error });
  });
});

describe('parseSubmission', () => {
  it('accepts an https link and an optional note', () => {
    expect(parseSubmission({ url: ' https://github.com/me/work ', note: 'ready' })).toEqual({ url: 'https://github.com/me/work', note: 'ready' });
    expect(parseSubmission({ url: 'https://codepen.io/x/pen/y' })).toEqual({ url: 'https://codepen.io/x/pen/y', note: null });
  });

  it.each(['http://example.com/x', 'javascript:alert(1)', 'https://localhost/x', 'https://user:pw@example.com/', 'not a url', ''])('refuses %s', (url) => {
    expect(parseSubmission({ url })).toBeNull();
  });

  it('refuses an oversized note', () => {
    expect(parseSubmission({ url: 'https://example.com/x', note: 'a'.repeat(1001) })).toBeNull();
  });
});

describe('bountyView', () => {
  const view = (row: BountyRow, held: ClaimRow | null) => bountyView({ bounty: row, claim: held, lang: 'en', now: NOW, functionsBase: 'https://fn.test/functions/v1' });

  it('states who holds the escrow key and where a refund goes', () => {
    expect(view(bounty(), null).escrow).toEqual({
      kind: 'derived_account',
      custody: 'itera_server',
      address: OTHER,
      explorer_url: `https://explorer.solana.com/address/${OTHER}?cluster=devnet`,
      target_lamports: 20_005_000,
      refund_address: AUTHORITY,
      program_id: null,
      program_explorer_url: null,
    });
  });

  it('names the program that holds a program escrow', () => {
    const held = bountyView({ bounty: bounty({ escrow_kind: 'program' }), claim: null, lang: 'en', now: NOW, functionsBase: 'https://fn.test/functions/v1', programId: OTHER });
    expect(held.escrow).toMatchObject({ kind: 'program', custody: 'program', target_lamports: 20_000_000, program_id: OTHER, program_explorer_url: `https://explorer.solana.com/address/${OTHER}?cluster=devnet` });
    expect(fundingCost({ escrow_kind: 'program', reward_lamports: 20_000_000 }, 1_640_840n)).toBe(21_640_840n);
    expect(fundingCost({ escrow_kind: 'derived_account', reward_lamports: 20_000_000 }, 1_640_840n)).toBe(20_005_000n);
  });

  it('keeps the delivery private until it was paid for, and never shows the review note', () => {
    const pending = view(bounty({ status: 'submitted', claim_id: claim.id }), claim);
    expect(pending.claim?.submission_url).toBeNull();
    expect(JSON.stringify(pending)).not.toContain('internal note');
    expect(JSON.stringify(pending)).not.toContain(claim.user_id);
    const paid = view(bounty({ status: 'paid', claim_id: claim.id, paid_wallet: WALLET, payout_lamports: 20_000_000, payout_signature: 'paysig', paid_at: '2026-10-11T03:00:00Z' }), { ...claim, status: 'approved' });
    expect(paid.claim?.submission_url).toBe('https://example.com/work');
    expect(paid.payout).toMatchObject({ signature: 'paysig', sol: '0.02 SOL', wallet: WALLET, explorer_url: 'https://explorer.solana.com/tx/paysig?cluster=devnet' });
  });

  it('offers the funding blink only while the bounty waits for money', () => {
    expect(view(bounty(), null).fund).toBeNull();
    expect(view(bounty({ status: 'awaiting_funding' }), null).fund?.action_url).toBe('https://fn.test/functions/v1/bounty-action/semantic-landing');
    expect(view(bounty({ status: 'awaiting_funding', expires_at: '2026-10-01T00:00:00Z' }), null).fund).toBeNull();
  });
});

describe('boardStats', () => {
  it('adds what was paid and what is locked', () => {
    const stats = boardStats(
      [
        bounty(),
        bounty({ status: 'claimed' }),
        bounty({ status: 'paid', payout_lamports: 20_000_000 }),
        bounty({ status: 'refunded' }),
        bounty({ status: 'open', expires_at: '2026-10-01T00:00:00Z' }),
      ],
      NOW,
    );
    expect(stats).toMatchObject({ paid_lamports: 20_000_000, paid_count: 1, locked_lamports: 40_010_000, open_count: 1 });
  });
});

describe('earningsView', () => {
  it('counts only payouts the chain confirms', () => {
    const paid = (slug: string, signature: string) =>
      bounty({ slug, status: 'paid', paid_wallet: WALLET, payout_lamports: 20_000_000, payout_signature: signature, paid_at: '2026-10-11T03:00:00Z' });
    const view = earningsView({ wallet: WALLET, bounties: [paid('a-one', 'sig-a'), paid('b-two', 'sig-b'), bounty({ status: 'paid', paid_wallet: OTHER, payout_signature: 'sig-c' })], landed: new Set(['sig-a']), lang: 'en' });
    expect(view).toMatchObject({ wallet: WALLET, earned_lamports: 20_000_000, earned_sol: '0.02 SOL', bounties_paid: 1 });
    expect(view.items.map((item) => [item.slug, item.verified])).toEqual([
      ['a-one', true],
      ['b-two', false],
    ]);
  });
});

describe('funding action', () => {
  it('describes the bounty and disables itself once funded', () => {
    const open = bountyActionGet({ bounty: bounty({ status: 'awaiting_funding' }), lang: 'en', missingLamports: 20_005_000n, href: 'https://fn.test/x', blocked: null });
    expect(open).toMatchObject({ type: 'action', title: 'Fund the bounty: Semantic page', links: { actions: [{ type: 'transaction', label: 'Lock 0.020005 SOL in escrow', href: 'https://fn.test/x' }] } });
    expect(open).not.toHaveProperty('disabled');
    const closed = bountyActionGet({ bounty: bounty(), lang: 'pt', missingLamports: 0n, href: 'https://fn.test/x', blocked: 'not_fundable' });
    expect(closed).toMatchObject({ disabled: true, error: { message: 'Esta missão já está financiada ou foi encerrada.' } });
  });

  it('chains to the confirmation', () => {
    expect(bountyActionPost({ bounty: bounty(), lang: 'en', transactionBase64: 'AAA', callbackHref: 'https://fn.test/confirm' })).toEqual({
      type: 'transaction',
      transaction: 'AAA',
      message: 'Bounty escrow: Semantic page',
      links: { next: { type: 'post', href: 'https://fn.test/confirm' } },
    });
    expect(bountyActionCompleted({ lang: 'en', funded: true }).description).toContain('locked in escrow');
    expect(bountyActionCompleted({ lang: 'en', funded: false }).description).toContain('as soon as the network confirms');
  });
});

describe('trailAttribute', () => {
  it('matches the clip the certification is written with', () => {
    expect(trailAttribute('Week 1 · HTML')).toBe('Week 1 · HTML');
    expect(trailAttribute('x'.repeat(90))).toHaveLength(80);
  });
});
