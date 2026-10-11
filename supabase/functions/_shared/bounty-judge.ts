import { createFor, sendAsApprover } from './bounty-chain.ts';
import { escrowPda } from './bounty-program.ts';
import { BOUNTY_COLUMNS, PROGRAM_SLUG, escrowTerms, gateOf, gatedEscrows, loadBounty, loadTrails, refreshFunding, settleTransfer } from './bounty-store.ts';
import { bountyPageUrl, refillCount, trailAttribute, transferMemo, type BountyRow, type BountyTemplate, type CheckReport, type Requirement } from './bounty.ts';
import { explorerUrl, pickText } from './credential.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { shortWallet } from './gift.ts';
import { takeRate } from './ratelimit.ts';
import { balanceOf } from './rpc.ts';
import { treasuryAddress } from './treasury.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A refill never takes the treasury below this: the same key pays the fee of every learner's stamp. */
export const REFILL_TREASURY_FLOOR_LAMPORTS = 200_000_000n;
const AVAILABLE = ['awaiting_funding', 'open', 'claimed', 'submitted', 'paying'];
const HISTORY = 5;

/** Whether this learner or this wallet was already paid by a judge bounty: one each. */
export async function alreadyJudged(db: IteraClient, userId: string, wallet: string): Promise<boolean> {
  const { data, error } = await db
    .from('bounty_claims')
    .select('id,bounties!inner(template_key)')
    .not('bounties.template_key', 'is', null)
    .eq('status', 'approved')
    .or(`user_id.eq.${userId},wallet.eq.${wallet}`)
    .limit(1);
  if (error) throw new Error(`bounty_claims judged: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * A delivery that passed the check: recorded as delivered with its code and report, approved with no reviewer, and
 * paid by the escrow program (the treasury key signs `release` as the bounty's approver). Returns the bounty after.
 */
export async function approveByCheck(db: IteraClient, bounty: BountyRow, userId: string, code: string, report: CheckReport): Promise<BountyRow | 'not_active'> {
  const claimId = bounty.claim_id;
  const submitted = await db.rpc('bounty_submit', { p_bounty: bounty.id, p_user_id: userId, p_url: bountyPageUrl(bounty.slug), p_note: null });
  if (submitted.error) throw new Error(`bounty_submit: ${submitted.error.message}`);
  if (submitted.data !== 'ok' || !claimId) return 'not_active';
  const stored = await db.from('bounty_claims').update({ submission_code: code, check_report: report }).eq('id', claimId);
  if (stored.error) throw new Error(`bounty_claims code: ${stored.error.message}`);
  const passed = report.checks.filter((check) => check.passed).length;
  const reviewed = await db.rpc('bounty_review', { p_bounty: bounty.id, p_reviewer: null, p_approve: true, p_note: `automatic check v${report.version}: ${passed}/${report.checks.length}` });
  if (reviewed.error) throw new Error(`bounty_review: ${reviewed.error.message}`);
  await settleTransfer(db, bounty.id);
  return (await loadBounty(db, { id: bounty.id })) ?? bounty;
}

/** Judge bounties whose payout is approved and not confirmed yet: the payout is finished. */
export async function settleJudged(db: IteraClient, max: number): Promise<number> {
  const { data, error } = await db.from('bounties').select('id').eq('status', 'paying').not('auto_check', 'is', null).limit(max);
  if (error) throw new Error(`bounties judged paying: ${error.message}`);
  for (const row of data ?? []) await settleTransfer(db, row.id as string).catch((reason) => console.error('judge payout not settled', row.id, reason));
  return (data ?? []).length;
}

async function fund(db: IteraClient, bounty: BountyRow, config: Record<string, string>, treasury: string): Promise<boolean> {
  const terms = await escrowTerms(bounty, config);
  if (!terms) return false;
  if ((await refreshFunding(db, bounty)).status === 'open') return true;
  const signature = await sendAsApprover([createFor(terms, treasury)], transferMemo(bounty.id, 'fund'));
  return (await refreshFunding(db, bounty, { wallet: treasury, signature })).status === 'open';
}

async function createFrom(db: IteraClient, template: BountyTemplate, config: Record<string, string>, treasury: string, now: Date): Promise<BountyRow | null> {
  const { payload } = template;
  const trail = (await loadTrails(db)).find((entry) => entry.unit_id === payload.unit_id);
  if (!trail) return null;
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + payload.expires_days * DAY_MS);
  expiresAt.setUTCMilliseconds(0);
  const requirement: Requirement = { program: PROGRAM_SLUG, unit_id: trail.unit_id, trail: trailAttribute(pickText(trail.title, 'en')), trail_title: trail.title, min_days: payload.min_days, total_days: trail.total_days };
  const gated = gatedEscrows(config);
  const escrow = await escrowPda(config.bounty_escrow_program, {
    bountyId: id,
    sponsor: treasury,
    approver: treasury,
    collection: config.collection_passports,
    amount: BigInt(payload.reward_lamports),
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
    gate: gated ? await gateOf(requirement) : null,
  });
  const { error } = await db.from('bounties').insert({
    id,
    slug: `${template.key}-${id.slice(0, 6)}`,
    tenant_id: config.bounty_treasury_tenant,
    sponsor_name: payload.sponsor_name,
    title_i18n: payload.title_i18n,
    summary_i18n: payload.summary_i18n,
    brief_i18n: payload.brief_i18n,
    deliverable_i18n: payload.deliverable_i18n,
    requirement,
    reward_lamports: payload.reward_lamports,
    escrow_kind: 'program',
    escrow_address: escrow,
    escrow_gated: gated,
    refund_address: treasury,
    claim_hours: payload.claim_hours,
    expires_at: expiresAt.toISOString(),
    auto_check: payload.auto_check,
    template_key: template.key,
  });
  if (error) throw new Error(`bounties template insert: ${error.message}`);
  await db.from('bounty_events').insert({ bounty_id: id, kind: 'created', wallet: treasury });
  return loadBounty(db, { id });
}

/**
 * Keeps each active template's bounties available: an unfunded one is funded, and new ones are created and funded
 * from the treasury up to `keep_open`, inside the day's cap and above the treasury's floor. One refill at a time.
 * Never throws; answers how many bounties it opened.
 */
export async function refillTemplates(db: IteraClient, now: Date): Promise<number> {
  try {
    const config = await loadConfig(db);
    if (!config.bounty_escrow_program || !config.collection_passports || !config.bounty_treasury_tenant) return 0;
    const templates = await db.from('bounty_templates').select('key,active,keep_open,daily_cap,payload').eq('active', true);
    if (templates.error) throw new Error(`bounty_templates: ${templates.error.message}`);
    if ((templates.data ?? []).length === 0) return 0;
    if (!(await takeRate(db, 'bounty-refill', 'all', { limit: 1, windowMs: 30_000 })).allowed) return 0;
    const treasury = await treasuryAddress();
    let opened = 0;
    for (const template of templates.data as unknown as BountyTemplate[]) {
      const { data, error } = await db.from('bounties').select(BOUNTY_COLUMNS).eq('template_key', template.key).or(`status.in.(${AVAILABLE.join(',')}),created_at.gte.${new Date(now.getTime() - DAY_MS).toISOString()}`).limit(500);
      if (error) throw new Error(`bounties template: ${error.message}`);
      const rows = (data ?? []) as unknown as BountyRow[];
      const available = rows.filter((row) => AVAILABLE.includes(row.status) && Date.parse(row.expires_at) > now.getTime());
      const createdToday = rows.filter((row) => now.getTime() - Date.parse(row.created_at) < DAY_MS).length;
      const unfunded = available.filter((row) => row.status === 'awaiting_funding');
      const missing = refillCount(template, available.length, createdToday);
      for (let index = 0; index < unfunded.length + missing; index += 1) {
        if ((await balanceOf(treasury)) < REFILL_TREASURY_FLOOR_LAMPORTS) {
          console.error('bounty refill skipped: the treasury is at its floor', template.key);
          return opened;
        }
        const bounty = unfunded[index] ?? (await createFrom(db, template, config, treasury, now));
        if (bounty && (await fund(db, bounty, config, treasury))) opened += 1;
      }
    }
    return opened;
  } catch (error) {
    console.error('bounty refill failed', error instanceof Error ? error.message : error);
    return 0;
  }
}

/** What the judge bounties paid so far, test accounts of the team left out of the count, and the latest payouts. */
export async function judgeHistory(db: IteraClient, tests: ReadonlySet<string>) {
  const { data, error } = await db
    .from('bounties')
    .select('id,slug,paid_at,paid_wallet,payout_lamports,payout_signature,bounty_claims(user_id,status)')
    .not('template_key', 'is', null)
    .eq('status', 'paid')
    .eq('is_test', false)
    .order('paid_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`bounties judged: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{ id: string; slug: string; paid_at: string; paid_wallet: string; payout_lamports: number; payout_signature: string | null; bounty_claims: Array<{ user_id: string; status: string }> }>;
  const payee = (row: (typeof rows)[number]) => row.bounty_claims.find((claim) => claim.status === 'approved')?.user_id ?? '';
  const outside = rows.filter((row) => !tests.has(payee(row)));
  return {
    count: outside.length,
    lamports: outside.reduce((sum, row) => sum + BigInt(row.payout_lamports ?? 0), 0n),
    team_test_count: rows.length - outside.length,
    team_test_lamports: rows.filter((row) => tests.has(payee(row))).reduce((sum, row) => sum + BigInt(row.payout_lamports ?? 0), 0n),
    latest: rows.slice(0, HISTORY).map((row) => ({
      slug: row.slug,
      paid_at: row.paid_at,
      wallet: row.paid_wallet,
      wallet_short: shortWallet(row.paid_wallet),
      team_test: tests.has(payee(row)),
      explorer_url: explorerUrl('tx', row.payout_signature),
    })),
  };
}
