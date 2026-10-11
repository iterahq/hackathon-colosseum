import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';
import { actionTitle } from './bountyAction';
import { plural } from './bounty';
import type { JudgeInfo, MyBountyStatus } from '@/types/bounty';

const bounty = { id: 'b1', status: 'open' as const, claim: null, judge: null as JudgeInfo | null, requirement: { program: 'p', unitId: 'u', trail: 'JavaScript', minDays: 3, totalDays: 5 } };
const status = (patch: Partial<MyBountyStatus> = {}): MyBountyStatus => ({ wallet: 'W', eligible: false, reason: null, proof: null, claim: null, busyElsewhere: false, judgedBefore: false, notInvited: false, inviteeWallet: null, ...patch });

const render = (locale: 'pt' | 'en', title: ReturnType<typeof actionTitle>) => {
  const t = (key: string, vars: Record<string, string | number> = {}) => (resources[locale][key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
  return title.count === undefined ? t(title.key, title.vars) : plural(t, title.key, title.count, title.vars);
};

describe('actionTitle', () => {
  it('is neutral while the status is not known', () => {
    expect(render('en', actionTitle(bounty, null))).toBe('Take this bounty');
  });
  it('says "Your turn" only when the wallet can take an open bounty', () => {
    expect(render('en', actionTitle(bounty, status({ eligible: true })))).toBe('Your turn');
  });
  it('says "Your turn" for the holder of the claim', () => {
    const held = { ...bounty, status: 'claimed' as const };
    const mine = status({ eligible: true, claim: { bountyId: 'b1', status: 'active', acceptedAt: null, deadlineAt: null, submissionUrl: null, submissionNote: null, submittedAt: null, reviewNote: null, checkReport: null } });
    expect(render('en', actionTitle(held, mine))).toBe('Your turn');
  });
  it('names the stamped days that are missing, with the days the wallet has', () => {
    const short = status({ reason: 'not_enough_days', proof: { asset: 'A', daysDone: 1, explorerUrl: null } });
    expect(render('en', actionTitle(bounty, short))).toBe('Not yet: 3 stamped days of JavaScript needed (1 in this wallet)');
    expect(render('pt', actionTitle(bounty, short))).toBe('Ainda não: 3 dias carimbados de JavaScript necessários (1 nesta carteira)');
  });
  it('uses the singular for one day, in both languages', () => {
    const one = { ...bounty, requirement: { ...bounty.requirement, minDays: 1 } };
    expect(render('en', actionTitle(one, status({ reason: 'not_enough_days' })))).toBe('Not yet: 1 stamped day of JavaScript needed');
    expect(render('pt', actionTitle(one, status({ reason: 'not_enough_days' })))).toBe('Ainda não: 1 dia carimbado de JavaScript necessário');
  });
  it('says there is no certification', () => {
    expect(render('en', actionTitle(bounty, status({ reason: 'no_certification' })))).toBe('Not yet: no JavaScript certification in this wallet');
    expect(render('pt', actionTitle(bounty, status({ reason: 'no_certification' })))).toBe('Ainda não: nenhuma certificação de JavaScript nesta carteira');
  });
  it('says to link a wallet for an e-mail account', () => {
    expect(render('en', actionTitle(bounty, status({ wallet: null, reason: 'no_wallet' })))).toBe('Not yet: link a wallet');
    expect(render('pt', actionTitle(bounty, status({ wallet: null, reason: 'no_wallet' })))).toBe('Ainda não: vincule uma carteira');
  });
  it('says it is not the turn when another bounty is in progress', () => {
    expect(render('en', actionTitle(bounty, status({ eligible: true, busyElsewhere: true })))).toBe('Not yet: finish your other bounty');
    expect(render('en', actionTitle(bounty, status({ notInvited: true, reason: 'not_invited' })))).toBe('This bounty is not for your wallet');
    expect(render('pt', actionTitle(bounty, status({ notInvited: true, reason: 'not_invited' })))).toBe('Esta missão não é para a sua carteira');
  });
  it('does not claim the turn on a bounty that is not open and not held', () => {
    expect(render('en', actionTitle({ ...bounty, status: 'paid' }, status({ eligible: true })))).toBe('Your bounty');
  });
  it('says a judge bounty is not for a wallet that already got one', () => {
    const judge = { ...bounty, judge: { checks: [], codeMax: 8000 } };
    expect(render('en', actionTitle(judge, status({ eligible: true, judgedBefore: true })))).toBe('Not this one: you already got a judge bounty');
    expect(render('en', actionTitle(bounty, status({ eligible: true, judgedBefore: true })))).toBe('Your turn');
  });
});
