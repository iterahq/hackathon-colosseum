import type { GateCheck } from '@/types/gateCheck';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The program's errors a visitor can meet here, each with a sentence of its own. */
const EXPLAINED = new Set(['not_a_certification', 'certification_not_owned_by_claimant', 'certification_of_another_collection', 'certification_not_frozen', 'certification_without_stamps', 'certification_of_another_trail', 'not_enough_stamped_days', 'not_open', 'expired']);

/** What the program answered, in one sentence. */
export function gateHeadline(t: Translate, check: Pick<GateCheck, 'verdict' | 'mode'>): string {
  const verdict = check.verdict;
  if (!verdict) return t('verify.gate.try.unconfirmed');
  if (!verdict.refused) return t('verify.gate.try.accepted');
  if (!verdict.errorName) return t('verify.gate.try.failedOther');
  return t(check.mode === 'sent' ? 'verify.gate.try.refusedSent' : 'verify.gate.try.refused', { name: verdict.errorName, hex: verdict.errorHex ?? '' });
}

/** Why, in plain words; `null` when the error is not one this page explains. */
export function gateReason(t: Translate, check: Pick<GateCheck, 'verdict' | 'bounty'>): string | null {
  const name = check.verdict?.errorName;
  return name && EXPLAINED.has(name) ? t(`verify.gate.try.reason.${name}`, { days: check.bounty.minDays, trail: check.bounty.trail }) : null;
}

/** What was handed to the program as the certification account. */
export function gateTried(t: Translate, check: Pick<GateCheck, 'claimant' | 'certification' | 'bounty'>): string {
  const who = t(check.claimant.kind === 'named' ? 'verify.gate.try.who.named' : 'verify.gate.try.who.made');
  const what = t(`verify.gate.try.cert.${check.certification.kind}`);
  return t('verify.gate.try.tried', { who, what, bounty: check.bounty.title });
}

/** The lines of the node's log that the program itself wrote: the last three. */
export function programLines(logs: readonly string[]): string {
  return logs.slice(-3).join('\n');
}
