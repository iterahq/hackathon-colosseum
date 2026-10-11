import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';
import { toGateCheck } from '@/services/gateCheck.service';
import { gateHeadline, gateReason, gateTried, programLines } from './gateCheck';

const t = (locale: 'pt' | 'en') => (key: string, vars: Record<string, string | number> = {}) => (resources[locale][key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
const answer = (over: Record<string, unknown> = {}) =>
  toGateCheck({
    mode: 'simulated',
    program_id: 'ETeJ',
    bounty: { slug: 'judge-bounty', title: 'Judge bounty: your first page', trail: 'Week 1 · HTML', min_days: 1 },
    escrow: 'Esc',
    claimant: { address: 'Gt', kind: 'made_for_this_check' },
    certification: { address: 'Cert', kind: 'another_wallets', url: 'https://explorer/x' },
    verdict: { refused: true, error_code: 6009, error_hex: '0x1779', error_name: 'certification_not_owned_by_claimant' },
    logs: ['a', 'Program ETeJ invoke [1]', 'Program ETeJ consumed 2389', 'Program ETeJ failed: custom program error: 0x1779'],
    repeat_with: 'curl -s https://api.devnet.solana.com',
    ...over,
  });

describe('gate check', () => {
  it('says the program refused, with its own error name and number, in both languages', () => {
    expect(gateHeadline(t('en'), answer())).toBe('The program refused: certification_not_owned_by_claimant (custom error 0x1779).');
    expect(gateHeadline(t('pt'), answer())).toBe('O programa recusou: certification_not_owned_by_claimant (erro 0x1779).');
    expect(gateReason(t('en'), answer())).toBe('The certification account handed to it belongs to another wallet. A certification cannot be borrowed.');
    expect(gateTried(t('en'), answer())).toContain("another learner's real certification");
  });

  it('a sent transaction says it failed on chain', () => {
    expect(gateHeadline(t('en'), answer({ mode: 'sent', signature: 'sig', explorer_url: 'https://x' }))).toBe('The transaction is on chain and the program failed it: certification_not_owned_by_claimant (custom error 0x1779).');
    expect(gateHeadline(t('en'), answer({ mode: 'sent', verdict: null }))).toBe('Sent. The node has not confirmed it yet: open the transaction in a moment.');
  });

  it('a wallet with enough days is told the program would accept it', () => {
    const ok = answer({ claimant: { address: 'Me', kind: 'named' }, certification: { address: 'Mine', kind: 'own' }, verdict: { refused: false, error_code: null, error_hex: null, error_name: null } });
    expect(gateHeadline(t('en'), ok)).toBe('The program would accept this wallet. Nothing was sent: this was a dry run.');
    expect(gateReason(t('en'), ok)).toBeNull();
    expect(gateTried(t('pt'), ok)).toContain('a certificação da própria carteira');
  });

  it('names the days when they are not enough, and explains every error it lists in both languages', () => {
    const short = answer({ verdict: { refused: true, error_code: 6018, error_hex: '0x1782', error_name: 'not_enough_stamped_days' }, bounty: { slug: 's', title: 'T', trail: 'Week 1 · HTML', min_days: 3 } });
    expect(gateReason(t('en'), short)).toBe('The certification has fewer stamped days than the 3 this bounty asks for.');
    for (const name of ['not_a_certification', 'certification_not_owned_by_claimant', 'certification_of_another_collection', 'certification_not_frozen', 'certification_without_stamps', 'certification_of_another_trail', 'not_enough_stamped_days', 'not_open', 'expired']) {
      for (const locale of ['pt', 'en'] as const) expect(resources[locale][`verify.gate.try.reason.${name}`], `${locale} ${name}`).toBeTruthy();
    }
  });

  it('keeps the last three log lines, the ones the program wrote', () => {
    expect(programLines(answer().logs)).toBe('Program ETeJ invoke [1]\nProgram ETeJ consumed 2389\nProgram ETeJ failed: custom program error: 0x1779');
  });
});
