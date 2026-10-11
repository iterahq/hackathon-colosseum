import { JSDOM } from 'jsdom';
import { judgeCode, parseCodeSubmission, refillCount, DELIVERY_CODE_MAX, type AutoCheck } from './bounty';
import type { HtmlParser } from './grading';
import { describe, expect, it } from 'vitest';
import {
  TRANSFER_LEASE_MS,
  boardStats,
  collapseJudgeBounties,
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
  parseWalletBounty,
  signerRole,
  slugify,
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
      days_checked_by: 'attester',
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

describe('boardStats and the team test accounts', () => {
  it('a payout to a test account is counted like the card that shows it, and named as a rehearsal', () => {
    const row = (id: string, status: string) => ({ id, status, origin: 'team', payout_lamports: 5_000_000, reward_lamports: 5_000_000, funded_lamports: 5_000_000, expires_at: '2099-01-01T00:00:00Z' }) as unknown as Parameters<typeof boardStats>[0][number];
    const rows = [row('real', 'paid'), row('test', 'paid'), row('open', 'open'), row('held', 'claimed')];
    expect(boardStats(rows, new Date('2026-10-11T00:00:00Z'))).toMatchObject({ paid_count: 2, paid_lamports: 10_000_000, rehearsal_paid_count: 0, outside_paid_count: 2, open_count: 1, held_count: 1 });
    expect(boardStats(rows, new Date('2026-10-11T00:00:00Z'), new Set(['test']))).toMatchObject({
      paid_count: 2,
      paid_lamports: 10_000_000,
      rehearsal_paid_count: 1,
      rehearsal_paid_sol: '0.005 SOL',
      outside_paid_count: 1,
      open_count: 1,
    });
  });
});

describe('boardStats and the judge bounties', () => {
  it('the total counts every payout, the team test runs of the judge bounty included, each in its own part', () => {
    const paid = { id: 'r', status: 'paid', origin: 'team', payout_lamports: 30_000_000, reward_lamports: 30_000_000, funded_lamports: 30_000_000, expires_at: '2099-01-01T00:00:00Z' } as unknown as Parameters<typeof boardStats>[0][number];
    const stats = boardStats([paid], new Date('2026-10-11T00:00:00Z'), new Set(['r']), new Set(), { count: 1, lamports: 10_000_000n, team_test_count: 2, team_test_lamports: 20_000_000n });
    expect(stats).toMatchObject({ paid_count: 4, paid_lamports: 60_000_000, paid_sol: '0.06 SOL', rehearsal_paid_count: 1, outside_paid_count: 0, judge_paid_count: 1, judge_team_test_paid_count: 2, judge_team_test_paid_sol: '0.02 SOL' });
    expect(stats.rehearsal_paid_count + stats.outside_paid_count + stats.judge_paid_count + stats.judge_team_test_paid_count).toBe(stats.paid_count);
  });
});

describe('collapseJudgeBounties', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  const row = (id: string, status: string, template: string | null, created: string) =>
    ({ id, status, template_key: template, created_at: created, expires_at: '2099-01-01T00:00:00Z' }) as unknown as Parameters<typeof collapseJudgeBounties>[0][number];

  it('lists one card per judge template: the oldest free one, with how many are free', () => {
    const rows = [row('held', 'claimed', 'judge', '2026-10-11T10:00:00Z'), row('free-new', 'open', 'judge', '2026-10-11T12:00:00Z'), row('other', 'open', null, '2026-10-10T00:00:00Z'), row('free-old', 'open', 'judge', '2026-10-11T11:00:00Z')];
    const { listed, slots } = collapseJudgeBounties(rows, now);
    expect(listed.map((bounty) => bounty.id)).toEqual(['other', 'free-old']);
    expect(slots.get('free-old')).toEqual({ open: 2, total: 3 });
  });

  it('shows a held one when none is free, and leaves other bounties alone', () => {
    const rows = [row('a', 'claimed', 'judge', '2026-10-11T10:00:00Z'), row('b', 'submitted', 'judge', '2026-10-11T11:00:00Z'), row('x', 'paid', null, '2026-10-10T00:00:00Z')];
    const { listed, slots } = collapseJudgeBounties(rows, now);
    expect(listed.map((bounty) => bounty.id)).toEqual(['a', 'x']);
    expect(slots.get('a')).toEqual({ open: 0, total: 2 });
  });
});

describe('parseWalletBounty', () => {
  const form = {
    sponsor_name: 'Padaria do Bairro',
    title: { en: 'Accessible price list for a bakery' },
    summary: { en: 'Turn our photographed price list into an HTML table a screen reader can read.' },
    brief: { en: 'Context: our prices are a photo. What to do: one HTML table with caption, header cells and at least eight products.' },
    deliverable: { en: 'A public link to the page (CodePen or GitHub Pages).' },
    reward_lamports: 20_000_000,
    unit_id: '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d',
    min_days: 1,
    expires_in_days: 7,
  };

  it('accepts one language and repeats it in the other', () => {
    const parsed = parseWalletBounty(form, NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.source_lang).toBe('en');
    expect(parsed.value.title_i18n).toEqual({ pt: form.title.en, en: form.title.en });
    expect(parsed.value.claim_hours).toBe(48);
    expect(parsed.value.expires_at).toBe('2026-10-18T12:00:00.000Z');
  });

  it('refuses a name of the team, a reward under the floor, a long deadline and thin text', () => {
    expect(parseWalletBounty({ ...form, sponsor_name: 'DevFellowship' }, NOW)).toEqual({ ok: false, error: 'invalid_sponsor' });
    expect(parseWalletBounty({ ...form, sponsor_name: 'Itera team' }, NOW)).toEqual({ ok: false, error: 'invalid_sponsor' });
    expect(parseWalletBounty({ ...form, reward_lamports: 9_999_999 }, NOW)).toEqual({ ok: false, error: 'invalid_reward' });
    expect(parseWalletBounty({ ...form, reward_lamports: 500_000_001 }, NOW)).toEqual({ ok: false, error: 'invalid_reward' });
    expect(parseWalletBounty({ ...form, expires_in_days: 31 }, NOW)).toEqual({ ok: false, error: 'invalid_deadline' });
    expect(parseWalletBounty({ ...form, claim_hours: 169 }, NOW)).toEqual({ ok: false, error: 'invalid_deadline' });
    expect(parseWalletBounty({ ...form, brief: { en: 'too short' } }, NOW)).toEqual({ ok: false, error: 'invalid_text' });
    expect(parseWalletBounty({ ...form, title: { en: form.title.en, pt: 'x' } }, NOW)).toEqual({ ok: false, error: 'invalid_text' });
  });

  it('drops invisible direction marks from what a sponsor typed', () => {
    const parsed = parseWalletBounty({ ...form, sponsor_name: 'Pada\u202eria' }, NOW);
    expect(parsed.ok && parsed.value.sponsor_name).toBe('Padaria');
  });
});

describe('slugify', () => {
  it('makes a readable ascii slug', () => {
    expect(slugify('Tabela de horários acessível!')).toBe('tabela-de-horarios-acessivel');
    expect(slugify('???')).toBe('bounty');
    expect(slugify('a'.repeat(80)).length).toBe(48);
  });
});

describe('bountyView for a wallet sponsor and for a rehearsal', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111', slug: 'lista-de-precos-ab12cd', slug_en: 'price-list-ab12cd', tenant_id: 't', sponsor_name: 'Padaria', title_i18n: { pt: 'Lista', en: 'List' }, summary_i18n: { pt: 's', en: 's' },
    brief_i18n: { pt: 'b', en: 'b' }, deliverable_i18n: { pt: 'd', en: 'd' }, requirement, reward_lamports: 20_000_000, escrow_kind: 'program', escrow_address: OTHER, refund_address: WALLET,
    status: 'open', claim_id: null, claim_hours: 48, expires_at: '2099-01-01T00:00:00Z', funded_at: null, funded_lamports: null, funding_signature: null, transfer_signature: null, transfer_sent_at: null,
    transfer_lamports: null, paid_at: null, paid_wallet: null, payout_lamports: null, payout_signature: null, refunded_at: null, refund_lamports: null, refund_signature: null, created_at: '2026-10-11T00:00:00Z',
    origin: 'wallet', sponsor_wallet: WALLET, approver_address: WALLET, source_lang: 'en', hidden_at: null, hidden_reason: null, delivery_mirror_url: null,
  } as unknown as BountyRow;

  it('names the wallet that posted, says it approves, and answers the slug of the language', () => {
    const view = bountyView({ bounty: base, claim: null, lang: 'en', now: NOW, functionsBase: 'https://f' });
    expect(view.posted_by).toMatchObject({ kind: 'wallet', wallet: WALLET });
    expect(view.approver).toBe('sponsor_wallet');
    expect(view.slug).toBe('price-list-ab12cd');
    expect(view.page_url.endsWith('/bounties/price-list-ab12cd')).toBe(true);
    expect(bountyView({ bounty: base, claim: null, lang: 'pt', now: NOW, functionsBase: 'https://f' }).slug).toBe('lista-de-precos-ab12cd');
    expect(view.rehearsal).toBe(false);
  });

  it('a team bounty is approved by Itera; a rehearsal shows the hosted copy of the delivery', () => {
    const claim = { id: 'c', bounty_id: base.id, user_id: 'u', wallet: OTHER, proof_asset: OTHER, proof: {}, status: 'approved', accepted_at: '', deadline_at: '', submission_url: 'https://private.example/x', submission_note: null, submitted_at: null, reviewed_at: null, review_note: null } as ClaimRow;
    const team = { ...base, origin: 'team', sponsor_wallet: null, approver_address: null, status: 'paid', delivery_mirror_url: 'https://site.example/rehearsal/form.html' } as BountyRow;
    const view = bountyView({ bounty: team, claim, lang: 'en', now: NOW, functionsBase: 'https://f', rehearsal: true });
    expect(view.approver).toBe('itera');
    expect(view.posted_by.wallet).toBeNull();
    expect(view.rehearsal).toBe(true);
    expect(view.claim?.submission_url).toBe('https://site.example/rehearsal/form.html');
    expect(view.claim?.submission_mirrored).toBe(true);
  });
});

const parseHtml: HtmlParser = (source) => {
  const { document } = new JSDOM(source).window;
  return {
    count: (selector) => document.querySelectorAll(selector).length,
    text: (selector) => document.querySelector(selector)?.textContent ?? null,
    attr: (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null,
  };
};

const CHECK: AutoCheck = {
  version: 1,
  language: 'html',
  checks: [
    { id: 'doctype', label: { en: 'doctype' }, assert: { type: 'source_has', tag: 'doctype' } },
    { id: 'title', label: { en: 'title' }, selector: 'head > title', assert: { type: 'exists' } },
    { id: 'h1', label: { en: 'h1' }, selector: 'body h1', assert: { type: 'count', equals: 1 } },
    { id: 'p', label: { en: 'p' }, selector: 'body p', assert: { type: 'exists' } },
    { id: 'closed', label: { en: 'closed' }, selector: 'html, head, title, body, h1, p', assert: { type: 'closes' } },
  ],
};
const PAGE = '<!DOCTYPE html>\n<html>\n<head><title>Mine</title></head>\n<body>\n<h1>Hello</h1>\n<p>I want to build a timetable.</p>\n</body>\n</html>';
const failed = (code: string) => judgeCode({ auto_check: CHECK }, code, parseHtml, NOW)?.checks.filter((check) => !check.passed).map((check) => check.id);

describe('judge bounty: the check on the delivered code', () => {
  it('passes a page with the five things asked', () => {
    expect(judgeCode({ auto_check: CHECK }, PAGE, parseHtml, NOW)).toEqual({ version: 1, passed: true, checked_at: NOW.toISOString(), checks: CHECK.checks.map((check) => ({ id: check.id, passed: true })) });
  });

  it('names each check a delivery fails', () => {
    expect(failed(PAGE.replace('<!DOCTYPE html>\n', ''))).toEqual(['doctype']);
    expect(failed(PAGE.replace('<title>Mine</title>', ''))).toEqual(['title']);
    expect(failed(PAGE.replace('<h1>Hello</h1>', '<h1>Hello</h1><h1>Again</h1>'))).toEqual(['h1']);
    expect(failed(PAGE.replace('<p>I want to build a timetable.</p>', ''))).toEqual(['p']);
    expect(failed(PAGE.replace('</h1>', ''))).toContain('closed');
    expect(failed('hello')).toEqual(['doctype', 'title', 'h1', 'p']);
  });

  it('does not pay for a script that writes the tags, nor for tags in a comment', () => {
    expect(failed('<!DOCTYPE html><html><head></head><body><script>document.write("<title>x</title><h1>a</h1><p>b</p>")</script></body></html>')).toEqual(['title', 'h1', 'p']);
    expect(failed('<!-- <!DOCTYPE html> --><html><head><title>x</title></head><body><!-- <h1>a</h1><p>b</p> --></body></html>')).toEqual(['doctype', 'h1', 'p']);
  });

  it('has no verdict for a bounty with no check: a person reviews it', () => {
    expect(judgeCode({ auto_check: null }, PAGE, parseHtml, NOW)).toBeNull();
    expect(judgeCode({ auto_check: { ...CHECK, checks: [] } }, PAGE, parseHtml, NOW)).toBeNull();
  });

  it('refuses a check the engine cannot run statically instead of passing it', () => {
    const dynamic: AutoCheck = { ...CHECK, checks: [{ id: 'style', label: { en: 'style' }, selector: 'h1', assert: { type: 'computed_style', property: 'color' } }] };
    expect(judgeCode({ auto_check: dynamic }, PAGE, parseHtml, NOW)?.passed).toBe(false);
  });
});

describe('judge bounty: the delivery', () => {
  it('takes code up to the limit and nothing empty', () => {
    expect(parseCodeSubmission({ code: PAGE })).toBe(PAGE);
    expect(parseCodeSubmission({ code: '   ' })).toBeNull();
    expect(parseCodeSubmission({ code: 'a'.repeat(DELIVERY_CODE_MAX + 1) })).toBeNull();
    expect(parseCodeSubmission({ url: 'https://example.com' })).toBeNull();
  });
});

describe('judge bounty: the refill', () => {
  const template = { active: true, keep_open: 2, daily_cap: 40 };
  it('tops up to what stays available', () => {
    expect(refillCount(template, 0, 0)).toBe(2);
    expect(refillCount(template, 1, 5)).toBe(1);
    expect(refillCount(template, 2, 5)).toBe(0);
    expect(refillCount(template, 3, 5)).toBe(0);
  });
  it('stops at the cap of the day and when switched off', () => {
    expect(refillCount(template, 0, 39)).toBe(1);
    expect(refillCount(template, 0, 40)).toBe(0);
    expect(refillCount(template, 0, 55)).toBe(0);
    expect(refillCount({ ...template, active: false }, 0, 0)).toBe(0);
  });
});

describe('signerRole', () => {
  const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
  const LEARNER = 'CreJgdt1nhqgqqxNkFXgLFokCucdTwKQWProuhcH7X4W';
  const SPONSOR = 'HWAGk3qYQ6m3Vd8m5oH9o9bM1c8r1cFz2G9w3z9tFHBP';
  const team = { origin: 'team' as const, sponsor_wallet: null, refund_address: TREASURY };
  const byWallet = { origin: 'wallet' as const, sponsor_wallet: SPONSOR, refund_address: SPONSOR };

  it('calls the treasury the treasury, even on a step that names the wallet that signed it', () => {
    expect(signerRole({ kind: 'funded', wallet: TREASURY, signature: 'S', signer: TREASURY }, team)).toBe('itera_treasury');
    expect(signerRole({ kind: 'escrow_moved', wallet: TREASURY, signature: 'S', signer: TREASURY }, team)).toBe('itera_treasury');
  });

  it('calls a learner only the wallet that signed its own accept or give-up', () => {
    expect(signerRole({ kind: 'accepted', wallet: LEARNER, signature: 'S', signer: LEARNER }, team)).toBe('learner');
    expect(signerRole({ kind: 'withdrawn', wallet: LEARNER, signature: 'S', signer: LEARNER }, byWallet)).toBe('learner');
    expect(signerRole({ kind: 'rejected', wallet: LEARNER, signature: 'S', signer: 'CPq4SPcqattester' }, team)).toBe('itera_key');
  });

  it('knows the sponsor`s wallet and says nothing without a signer', () => {
    expect(signerRole({ kind: 'funded', wallet: SPONSOR, signature: 'S', signer: SPONSOR }, byWallet)).toBe('sponsor');
    expect(signerRole({ kind: 'paid', wallet: LEARNER, signature: 'S', signer: null }, team)).toBeNull();
    expect(signerRole({ kind: 'created', wallet: null, signature: null, signer: TREASURY }, team)).toBeNull();
  });
});
