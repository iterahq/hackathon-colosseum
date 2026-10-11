import { describe, expect, it } from 'vitest';
import { BountyTxError, bountyErrorCode, describeTxError, parseApprove, parseBoard, parseBounty, parseConfirm, parseDetail, parseModeration, parseMyStatus, parsePostedList, parsePostOptions, parseSponsorList, parseWalletTx } from './bounty.service';
import { WalletSignError } from './walletSign';
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
  it('reads who posted it, who approves and the flags', () => {
    const b = parseBounty({
      ...bounty,
      slugs: { pt: 'faq-pt', en: 'faq-en' },
      posted_by: { kind: 'wallet', name: 'Acme Inc', wallet: 'WalletAddr1234', wallet_short: 'Wall…234', profile_url: 'https://x/u/W' },
      approver: 'sponsor_wallet',
      rehearsal: true,
      hidden: true,
      written_in: 'pt',
      claim: { wallet: 'W', submission_mirrored: true },
    });
    expect(b?.slugs).toEqual({ pt: 'faq-pt', en: 'faq-en' });
    expect(b?.postedBy).toEqual({ kind: 'wallet', teamTest: false, name: 'Acme Inc', wallet: 'WalletAddr1234', walletShort: 'Wall…234', profileUrl: 'https://x/u/W' });
    expect(b).toMatchObject({ approver: 'sponsor_wallet', rehearsal: true, hidden: true, writtenIn: 'pt' });
    expect(b?.claim?.submissionMirrored).toBe(true);
  });
  it('defaults to a team bounty approved by Itera', () => {
    const b = parseBounty(bounty);
    expect(b?.postedBy).toMatchObject({ kind: 'team', name: 'DevFellowship', wallet: null });
    expect(b).toMatchObject({ approver: 'itera', rehearsal: false, hidden: false, writtenIn: null, slugs: { pt: 'faq', en: 'faq' } });
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
    expect(board.stats).toEqual({
      paidSol: '0 SOL',
      lockedSol: '0 SOL',
      paidCount: 0,
      openCount: 0,
      rehearsalPaidCount: 0,
      rehearsalPaidSol: '0 SOL',
      outsidePaidCount: 0,
      outsidePaidSol: '0 SOL',
      heldCount: 0,
      outsideSponsorCount: 0,
    });
    expect(board.readAt).toBeNull();
  });
  it('reads the stats', () => {
    const board = parseBoard({ stats: { paid_sol: '1 SOL', locked_sol: '2 SOL', paid_count: 1, open_count: 4 }, bounties: [] });
    expect(board.stats).toMatchObject({ paidSol: '1 SOL', lockedSol: '2 SOL', paidCount: 1, openCount: 4 });
  });
  it('reads the split between rehearsals and outside payouts', () => {
    const board = parseBoard({
      read_at: '2026-10-11T12:00:00Z',
      stats: { paid_count: 3, paid_sol: '0.3 SOL', rehearsal_paid_count: 2, rehearsal_paid_sol: '0.2 SOL', outside_paid_count: 1, outside_paid_sol: '0.1 SOL', held_count: 2, outside_sponsor_count: 1 },
      bounties: [],
    });
    expect(board.readAt).toBe('2026-10-11T12:00:00Z');
    expect(board.stats).toMatchObject({ rehearsalPaidCount: 2, rehearsalPaidSol: '0.2 SOL', outsidePaidCount: 1, outsidePaidSol: '0.1 SOL', heldCount: 2, outsideSponsorCount: 1 });
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

describe('post options', () => {
  it('reads limits and trails', () => {
    const options = parsePostOptions({
      cluster: 'devnet',
      program_id: 'Prog',
      trails: [{ unit_id: 'u1', title: { pt: 'Semana 1', en: 'Week 1' }, total_days: 5 }, { title: {} }],
      limits: { min_reward_lamports: 1000000, max_reward_lamports: 500000000, escrow_rent_lamports: null, fee_lamports: 5000, posts_per_day: 1, live_bounties: 3, max_expiry_days: 30, max_claim_hours: 168 },
    });
    expect(options.trails).toHaveLength(1);
    expect(options.limits).toMatchObject({ minRewardLamports: 1000000, escrowRentLamports: null, feeLamports: 5000, postsPerDay: 1, maxClaimHours: 168 });
    expect(options.programId).toBe('Prog');
  });
});

describe('posted list', () => {
  it('reads the wallet, the balance and the review with its proof', () => {
    const list = parsePostedList({
      wallet: 'W',
      balance_lamports: 2000000000,
      bounties: [{ ...bounty, hidden_reason: 'spam', review: { status: 'submitted', wallet: 'L', submission_url: 'https://c', submission_note: 'n', submitted_at: 't', proof: { days_done: 1 }, proof_asset: 'A' } }, { nope: 1 }],
    });
    expect(list.wallet).toBe('W');
    expect(list.balanceLamports).toBe(2000000000);
    expect(list.bounties).toHaveLength(1);
    expect(list.bounties[0]).toMatchObject({ hiddenReason: 'spam' });
    expect(list.bounties[0].review).toMatchObject({ wallet: 'L', proofDays: 1, proofAsset: 'A' });
  });
  it('has no balance when the server does not know it', () => {
    expect(parsePostedList({ wallet: 'W', balance_lamports: null, bounties: [] }).balanceLamports).toBeNull();
  });
});

describe('wallet transactions', () => {
  const tx = { kind: 'fund', payer: 'P', message_base58: 'm58', message_base64: 'm64', transaction_base58: 't58', transaction_base64: 't64', cost_lamports: 5, rent_lamports: 2, escrow: 'E' };
  it('reads a transaction', () => {
    expect(parseWalletTx(tx)).toMatchObject({ kind: 'fund', payer: 'P', messageBase58: 'm58', costLamports: 5, rentLamports: 2, escrow: 'E', pays: null });
    expect(parseWalletTx({ ...tx, kind: 'approve', pays: 'L', lamports: 9 })).toMatchObject({ kind: 'approve', pays: 'L', lamports: 9 });
  });
  it('refuses a transaction it cannot sign', () => {
    expect(parseWalletTx({ ...tx, payer: undefined })).toBeNull();
    expect(parseWalletTx({ ...tx, kind: 'steal' })).toBeNull();
  });
  it('reads a confirmation', () => {
    expect(parseConfirm({ status: 'open', changed: true, funding_signature: 'F' })).toEqual({ status: 'open', changed: true, payoutSignature: null, refundSignature: null, fundingSignature: 'F' });
    expect(parseConfirm({}).changed).toBe(false);
  });
});

describe('moderation', () => {
  it('reads the rows with their reports', () => {
    const rows = parseModeration({
      bounties: [{ id: 'b1', slug: 's', sponsor_name: 'Acme', sponsor_wallet: 'W', title_i18n: { en: 'T' }, status: 'open', reward_lamports: 5, hidden_at: null, hidden_reason: null, created_at: 'c', bounty_reports: [{ reason: 'scam', created_at: 'r' }] }, { slug: 'no-id' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'b1', title: 'T', sponsorName: 'Acme', hiddenAt: null, reports: [{ reason: 'scam', createdAt: 'r' }] });
  });
});

describe('describeTxError', () => {
  it('names the wallet that has to sign', () => {
    expect(describeTxError(new BountyTxError('wrong_wallet', 'P'))).toEqual({ key: 'bounty.tx.err.wrong_wallet', vars: { wallet: 'P' }, faucet: false });
  });
  it('points an empty wallet at the faucet', () => {
    expect(describeTxError(new WalletSignError('insufficient', 'x')).faucet).toBe(true);
    expect(describeTxError(new WalletSignError('cancelled', 'x'))).toMatchObject({ key: 'bounty.tx.err.wallet.cancelled', faucet: false });
  });
  it('shows the amounts of an insufficient_funds answer', () => {
    const error = new ShopCallError('x', 402, 'insufficient_funds', false, null, null, { required_lamports: 120005000, balance_lamports: 1000 });
    expect(describeTxError(error)).toMatchObject({ key: 'bounty.tx.err.insufficient_funds', vars: { need: '0.120005', have: '0.000001' }, faucet: true });
  });
  it('maps known codes and falls back to the generic text', () => {
    expect(describeTxError(new ShopCallError('x', 409, 'already_paid')).key).toBe('bounty.tx.err.already_paid');
    expect(describeTxError(new ShopCallError('x', 500, 'weird')).key).toBe('bounty.err.generic');
    expect(describeTxError(new Error('boom')).key).toBe('bounty.err.generic');
  });
});
