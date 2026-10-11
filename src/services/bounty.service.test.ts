import { describe, expect, it } from 'vitest';
import { bountyErrorCode, parseApprove, parseBoard, parseBounty, parseDetail, parseMyStatus, parseSponsorList } from './bounty.service';
import { ShopCallError } from './shopTransport';

const bounty = {
  id: 'b1',
  slug: 'faq',
  sponsor: 'DevFellowship',
  title: 'FAQ',
  summary: 's',
  brief: 'line 1\nline 2',
  deliverable: 'a link',
  status: 'open',
  reward_lamports: 120000000,
  reward_sol: '0.12 SOL',
  requirement: { program: 'itera-v2', unit_id: 'u1', trail: 'Week 3 · JavaScript', min_days: 3, total_days: 5 },
  escrow: { address: 'Esc1', explorer_url: 'https://x/a', target_lamports: 120005000, refund_address: 'Ref1' },
  claim_hours: 72,
  expires_at: '2026-11-01T00:00:00Z',
  claim: null,
  funding: { signature: 'sig', lamports: 120005000, sol: '0.120005 SOL', at: '2026-10-11T00:00:00Z', wallet: null, explorer_url: 'https://x/t' },
  payout: null,
  fund: null,
};

describe('parseBounty', () => {
  it('reads a full row', () => {
    const b = parseBounty(bounty);
    expect(b?.requirement).toEqual({ program: 'itera-v2', unitId: 'u1', trail: 'Week 3 · JavaScript', minDays: 3, totalDays: 5 });
    expect(b?.escrow?.explorerUrl).toBe('https://x/a');
    expect(b?.funding?.signature).toBe('sig');
    expect(b?.payout).toBeNull();
    expect(b?.fundBlinkUrl).toBeNull();
  });
  it('drops rows without id, slug or a known status', () => {
    expect(parseBounty({ ...bounty, id: undefined })).toBeNull();
    expect(parseBounty({ ...bounty, status: 'weird' })).toBeNull();
    expect(parseBounty(null)).toBeNull();
  });
});

describe('parseBoard', () => {
  it('skips broken rows and defaults the stats', () => {
    const board = parseBoard({ bounties: [bounty, { nope: true }] });
    expect(board.bounties).toHaveLength(1);
    expect(board.stats).toEqual({ paidSol: '0 SOL', lockedSol: '0 SOL', paidCount: 0, openCount: 0 });
  });
  it('reads the stats', () => {
    const board = parseBoard({ stats: { paid_sol: '1 SOL', locked_sol: '2 SOL', paid_count: 1, open_count: 4 }, bounties: [] });
    expect(board.stats).toEqual({ paidSol: '1 SOL', lockedSol: '2 SOL', paidCount: 1, openCount: 4 });
  });
});

describe('parseDetail', () => {
  it('keeps the ledger and drops rows without a kind', () => {
    const detail = parseDetail({ ...bounty, events: [{ kind: 'funded', wallet: 'W', lamports: 5, sol: '0.000000005 SOL', signature: 'sig', explorer_url: 'https://x/t', at: 'now' }, { wallet: 'x' }] });
    expect(detail?.events).toHaveLength(1);
    expect(detail?.events[0]).toMatchObject({ kind: 'funded', explorerUrl: 'https://x/t', signature: 'sig' });
  });
  it('is null for an unreadable body', () => {
    expect(parseDetail({})).toBeNull();
  });
});

describe('parseMyStatus', () => {
  it('reads an eligible learner', () => {
    const s = parseMyStatus({ wallet: 'W', eligible: true, reason: null, proof: { asset: 'A', days_done: 3, explorer_url: 'https://x' }, claim: null, busy_elsewhere: false });
    expect(s.eligible).toBe(true);
    expect(s.proof).toEqual({ asset: 'A', daysDone: 3, explorerUrl: 'https://x' });
  });
  it('reads a refusal reason and ignores unknown ones', () => {
    expect(parseMyStatus({ eligible: false, reason: 'not_enough_days' }).reason).toBe('not_enough_days');
    expect(parseMyStatus({ eligible: false, reason: 'mystery' }).reason).toBeNull();
  });
  it('reads an active claim', () => {
    const s = parseMyStatus({ claim: { bounty_id: 'b1', status: 'rejected', review_note: 'redo', deadline_at: 'd' }, busy_elsewhere: true });
    expect(s.claim).toMatchObject({ bountyId: 'b1', status: 'rejected', reviewNote: 'redo' });
    expect(s.busyElsewhere).toBe(true);
  });
});

describe('sponsor answers', () => {
  it('reads trails, titles and the review block', () => {
    const list = parseSponsorList({
      trails: [{ unit_id: 'u1', title: { pt: 'Semana 1', en: 'Week 1' }, total_days: 5 }, { title: {} }],
      bounties: [{ ...bounty, status: 'submitted', title_i18n: { pt: 'FAQ pt', en: 'FAQ en' }, treasury_fundable: true, review: { status: 'submitted', wallet: 'W', submission_url: 'https://c', submission_note: 'n', submitted_at: 't', proof: { days_done: 4 } } }],
    });
    expect(list.trails).toEqual([{ unitId: 'u1', title: { pt: 'Semana 1', en: 'Week 1' }, totalDays: 5 }]);
    expect(list.bounties[0]).toMatchObject({ treasuryFundable: true, titleI18n: { pt: 'FAQ pt', en: 'FAQ en' } });
    expect(list.bounties[0].review).toMatchObject({ wallet: 'W', proofDays: 4, submissionUrl: 'https://c' });
  });
  it('tells a settled approval from a pending one', () => {
    expect(parseApprove({ approved: true, outcome: 'settled', status: 'paid', payout_signature: 'S' })).toEqual({ outcome: 'settled', status: 'paid', signature: 'S' });
    expect(parseApprove({ outcome: 'pending' }).outcome).toBe('pending');
  });
});

describe('bountyErrorCode', () => {
  it('reads the refusal code of a failed call', () => {
    expect(bountyErrorCode(new ShopCallError('x', 409, 'not_open'))).toBe('not_open');
    expect(bountyErrorCode(new ShopCallError('x', 403, 'forbidden'))).toBe('forbidden');
  });
  it('is null when there is none', () => {
    expect(bountyErrorCode(new Error('boom'))).toBeNull();
    expect(bountyErrorCode(null)).toBeNull();
  });
});
