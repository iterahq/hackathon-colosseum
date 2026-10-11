import { plural } from '@/utils/bounty';
import type { BountyStats, CheckReport, JudgeInfo } from '@/types/bounty';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface CheckRow {
  id: string;
  label: string;
  state: 'pass' | 'fail' | 'unknown';
}

/** The bounty's checks with the verdict of a report: a check the report does not mention is `unknown`. */
export function checkRows(judge: JudgeInfo, report: CheckReport | null): CheckRow[] {
  return judge.checks.map((check) => {
    const found = report?.checks.find((entry) => entry.id === check.id);
    return { id: check.id, label: check.label, state: found ? (found.passed ? 'pass' : 'fail') : 'unknown' };
  });
}

/** The payout line of the stats: person-approved, team rehearsal and judge payouts kept apart. `null` when no judge bounty was paid. */
export function judgePaidHint(t: Translate, stats: BountyStats): string | null {
  if (stats.judgePaidCount <= 0) return null;
  const parts: string[] = [];
  if (stats.outsidePaidCount > 0) parts.push(plural(t, 'bounty.stats.part.outside', stats.outsidePaidCount));
  if (stats.rehearsalPaidCount > 0) parts.push(plural(t, 'bounty.stats.part.rehearsal', stats.rehearsalPaidCount));
  parts.push(plural(t, 'bounty.stats.part.judge', stats.judgePaidCount));
  return parts.join(' · ');
}

export interface EventLabel {
  key: string;
  vars: Record<string, string | number>;
  serverRecord: boolean;
}

/** The ledger label of a step: an `approved` step of a judge bounty says no person approved it. */
export function eventLabel(kind: string, judge: JudgeInfo | null, report: CheckReport | null): EventLabel {
  if (kind === 'approved' && judge) {
    return report && report.checks.length > 0
      ? { key: 'bounty.event.approvedByCheck', vars: { n: report.checks.filter((c) => c.passed).length, total: report.checks.length }, serverRecord: true }
      : { key: 'bounty.event.approvedByCheckNoCount', vars: {}, serverRecord: true };
  }
  return { key: `bounty.event.${kind}`, vars: {}, serverRecord: false };
}

/** The sentence that says who checks the stamped days at accept. */
export function daysRuleText(t: Translate, daysCheckedBy: 'program' | 'attester' | undefined, minDays: number): string {
  return daysCheckedBy === 'program' ? plural(t, 'bounty.days.program', minDays) : t('bounty.days.attester');
}

/** The board footer about where the days are read, from the counts of the bounties listed. `null` when the board does not say. */
export function daysFooter(t: Translate, stats: BountyStats): string | null {
  const program = stats.daysByProgramCount;
  const attester = stats.daysByAttesterCount;
  if (program === null || attester === null) return null;
  if (attester === 0) return t('bounty.days.footer.all');
  return plural(t, 'bounty.days.footer.mixed', attester, { p: program, a: attester });
}
