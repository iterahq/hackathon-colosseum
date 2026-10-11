import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';
import { checkRows, daysFooter, daysRuleText, eventLabel, judgeBoardTitle, judgePaidHint, judgeSlotsText, signerCaptionKey } from './bountyJudge';
import type { BountyStats, JudgeInfo } from '@/types/bounty';

const t = (locale: 'pt' | 'en') => (key: string, vars: Record<string, string | number> = {}) => (resources[locale][key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
const judge: JudgeInfo = { checks: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], codeMax: 8000 };
const stats = (patch: Partial<BountyStats>): BountyStats => ({
  paidSol: '0.05 SOL', lockedSol: '', paidCount: 4, openCount: 0, rehearsalPaidCount: 0, rehearsalPaidSol: '', outsidePaidCount: 0, outsidePaidSol: '', heldCount: 0, outsideSponsorCount: 0,
  hiddenTestCount: null, listedCount: null, judgePaidCount: 0, judgePaidSol: '0 SOL', openOnChainCount: null, daysByProgramCount: null, daysByAttesterCount: null, ...patch,
});

describe('checkRows', () => {
  it('marks each check from the report and leaves unmentioned ones unknown', () => {
    const report = { version: 1, passed: false, checks: [{ id: 'a', passed: true }, { id: 'b', passed: false }], checkedAt: null };
    expect(checkRows(judge, report).map((r) => r.state)).toEqual(['pass', 'fail']);
    expect(checkRows(judge, null).map((r) => r.state)).toEqual(['unknown', 'unknown']);
  });
});

describe('judgePaidHint', () => {
  it('is null without judge payouts', () => {
    expect(judgePaidHint(t('en'), stats({}))).toBeNull();
  });
  it('keeps person-approved, team rehearsal and judge payouts apart', () => {
    expect(judgePaidHint(t('en'), stats({ paidCount: 3, rehearsalPaidCount: 1, judgePaidCount: 2 }))).toBe('3 payouts on chain: 1 team rehearsal · 2 judge bounties (automatic check)');
    expect(judgePaidHint(t('en'), stats({ paidCount: 3, outsidePaidCount: 1, rehearsalPaidCount: 1, judgePaidCount: 1 }))).toBe('3 payouts on chain: 1 approved by a person · 1 team rehearsal · 1 judge bounty (automatic check)');
    expect(judgePaidHint(t('pt'), stats({ paidCount: 3, judgePaidCount: 3 }))).toBe('3 pagamentos na chain: 3 missões do jurado (verificação automática)');
  });
  it('counts the team test runs of the judge bounty, so the parts add up to the total the tile shows', () => {
    expect(judgePaidHint(t('en'), stats({ paidCount: 4, rehearsalPaidCount: 1, judgePaidCount: 1, judgeTeamTestPaidCount: 2 }))).toBe(
      '4 payouts on chain: 1 team rehearsal · 1 judge bounty (automatic check) · 2 team test runs of the judge bounty',
    );
    expect(judgePaidHint(t('pt'), stats({ paidCount: 1, judgeTeamTestPaidCount: 1 }))).toBe('1 pagamento na chain: 1 teste do time na missão do jurado');
  });
});

describe('judgeBoardTitle', () => {
  it('counts every judge payout the way the tile does, and says how many the list shows', () => {
    expect(judgeBoardTitle(t('en'), { outside: 1, teamTests: 5, listed: 5 })).toBe('6 judge bounty payouts by the automatic check · outside wallets: 1 · team test runs: 5 · latest 5 below');
    expect(judgeBoardTitle(t('en'), { outside: 1, teamTests: 0, listed: 1 })).toBe('1 judge bounty payout by the automatic check · outside wallets: 1 · team test runs: 0');
    expect(judgeBoardTitle(t('pt'), { outside: 0, teamTests: 2, listed: 2 })).toBe('2 pagamentos da missão do jurado pela verificação automática · carteiras de fora: 0 · testes do time: 2');
    expect(judgeBoardTitle(t('en'), { outside: 0, teamTests: 0, listed: 0 })).toBe("Judge bounties: none paid to an outside wallet yet · the team's latest test runs below");
  });
});

describe('judgeSlotsText', () => {
  it('says how many copies are free only when there is more than one', () => {
    expect(judgeSlotsText(t('en'), { openCount: 1, slotCount: 2 })).toBe('1 of 2 free now · one taker at a time on each');
    expect(judgeSlotsText(t('pt'), { openCount: 0, slotCount: 3 })).toBe('0 de 3 livres agora · uma pessoa por vez em cada');
    expect(judgeSlotsText(t('en'), { openCount: 1, slotCount: 1 })).toBeNull();
    expect(judgeSlotsText(t('en'), {})).toBeNull();
  });
});

describe('eventLabel', () => {
  const report = { version: 1, passed: true, checks: [{ id: 'a', passed: true }, { id: 'b', passed: true }], checkedAt: null };
  it('says the automatic check approved a judge bounty, with the count when the report has it', () => {
    expect(t('en')(eventLabel('approved', judge, report).key, eventLabel('approved', judge, report).vars)).toBe("Approved by the automatic check (2 of 2), not by a person. A record kept by Itera's server.");
    expect(eventLabel('approved', judge, null).key).toBe('bounty.event.approvedByCheckNoCount');
  });
  it('leaves other bounties and other steps as they were', () => {
    expect(eventLabel('approved', null, null)).toEqual({ key: 'bounty.event.approved', vars: {}, serverRecord: false });
    expect(eventLabel('escrow_moved', judge, report).key).toBe('bounty.event.escrow_moved');
    expect(resources.en['bounty.event.escrow_moved']).toBeTruthy();
    expect(resources.pt['bounty.event.escrow_moved']).toBeTruthy();
  });
});

describe('where the days are checked', () => {
  it('says what the program reads for a gated bounty, with the singular', () => {
    expect(daysRuleText(t('en'), 'program', 1)).toContain('with at least 1 stamped day. Nobody co-signs');
    expect(daysRuleText(t('en'), 'program', 3)).toContain('at least 3 stamped days');
    expect(daysRuleText(t('pt'), 'program', 3)).toContain('pelo menos 3 dias carimbados');
  });
  it('says Itera\'s key co-signs for an older bounty', () => {
    expect(daysRuleText(t('en'), 'attester', 3)).toContain("Itera's key co-signs");
    expect(daysRuleText(t('en'), undefined, 3)).toContain("Itera's key co-signs");
  });
  it('words the board footer by the counts', () => {
    expect(daysFooter(t('en'), stats({}))).toBeNull();
    expect(daysFooter(t('en'), stats({ daysByProgramCount: 3, daysByAttesterCount: 0 }))).toMatch(/^Every bounty listed here names its trail/);
    expect(daysFooter(t('en'), stats({ daysByProgramCount: 3, daysByAttesterCount: 1 }))).toBe("3 of the bounties listed name their days in the escrow account and the program reads them; 1 older one relies on Itera's key co-signing for the days.");
    expect(daysFooter(t('en'), stats({ daysByProgramCount: 3, daysByAttesterCount: 2 }))).toContain('2 older ones rely');
  });
});

describe('signerCaptionKey', () => {
  const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
  const LEARNER = 'CreJgdt1nhqgqqxNkFXgLFokCucdTwKQWProuhcH7X4W';

  it('never calls a funding step the learner`s, even when the step names the wallet that signed it', () => {
    expect(signerCaptionKey({ kind: 'funded', wallet: TREASURY, signedBy: TREASURY, signedRole: null })).toBe('bounty.ledger.signedIteraPlain');
    expect(signerCaptionKey({ kind: 'escrow_moved', wallet: TREASURY, signedBy: TREASURY, signedRole: 'itera_treasury' })).toBe('bounty.ledger.signedTreasury');
  });

  it('follows the role the server resolved', () => {
    expect(signerCaptionKey({ kind: 'accepted', wallet: LEARNER, signedBy: LEARNER, signedRole: 'learner' })).toBe('bounty.ledger.signedLearner');
    expect(signerCaptionKey({ kind: 'funded', wallet: LEARNER, signedBy: LEARNER, signedRole: 'sponsor' })).toBe('bounty.ledger.signedSponsor');
    expect(signerCaptionKey({ kind: 'rejected', wallet: LEARNER, signedBy: TREASURY, signedRole: 'itera_key' })).toBe('bounty.ledger.signedItera');
  });

  it('without the role, a learner step signed by the wallet it names is the learner`s', () => {
    expect(signerCaptionKey({ kind: 'accepted', wallet: LEARNER, signedBy: LEARNER, signedRole: null })).toBe('bounty.ledger.signedLearner');
    expect(signerCaptionKey({ kind: 'accepted', wallet: LEARNER, signedBy: TREASURY, signedRole: null })).toBe('bounty.ledger.signedIteraPlain');
  });
});
