import { ArrowRight, Binary, Check, KeyRound, ShieldCheck, Snowflake } from 'lucide-react';
import { ChainProof } from '@/components/chain/ChainProof';
import { CopyButton } from '@/components/passport/CopyButton';
import { CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { MPL_CORE_PROGRAM } from '@/lib/chain/coreAsset';
import { ESCROW_PROGRAM } from '@/lib/chain/escrowAccount';
import { SAMPLE_ASSET } from '@/lib/chain/samples';
import { questProgress, type QuestTarget } from '@/utils/verifyQuest';

const QUESTS = [
  { n: 1, target: 'program', Icon: Binary },
  { n: 2, target: 'soulbound', Icon: Snowflake },
  { n: 3, target: 'gate', Icon: ShieldCheck },
] as const satisfies ReadonlyArray<{ n: number; target: QuestTarget; Icon: typeof Binary }>;

function Address({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { t } = useI18n();
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-3 first:pt-1 last:pb-1" data-testid={testId}>
      <span className={`${MONO_LABEL} text-[#A0978A]`}>{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 break-all [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2]">{value}</span>
        <CopyButton value={value} label={t('passport.copyAddress')} doneLabel={t('passport.copied')} display="" />
      </div>
      <ChainProof kind="address" value={value} compact />
    </li>
  );
}

/** The three checks a judge wants first, as quest cards, and the five addresses behind them; every section below is the long form of one check. */
export function SummaryCard({ opened }: { opened: ReadonlySet<string> }) {
  const { t } = useI18n();
  const circuit = useCircuit(null);
  const authority = circuit.data?.authority ?? null;
  const treasury = circuit.data?.treasury ?? null;
  const progress = questProgress(opened);
  const count = 3 + (authority ? 1 : 0) + (treasury ? 1 : 0);
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="verify-summary-title" data-testid="verify-summary">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h2 id="verify-summary-title" title={t('verify.summary.intro')} className="[font:700_26px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('verify.summary.title')}</h2>
        <div className="flex min-w-[160px] flex-col gap-1.5">
          <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('verify.quest.progress', { n: progress.done })}</span>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={t('verify.quest.progress', { n: progress.done })} className="h-1.5 overflow-hidden rounded-full bg-[#262320]">
            <div className="h-full rounded-full bg-[#3FD17F] transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {QUESTS.map(({ n, target, Icon }) => {
          const done = progress.byId[target];
          return (
            <li key={target} className="flex">
              <a
                href={`#${target}`}
                data-testid={`verify-quest-${target}`}
                data-opened={done}
                className={`${CARD} group/quest flex min-h-11 w-full min-w-0 flex-col gap-2 p-4 transition-[transform,border-color] duration-150 hover:border-[#3FD17F] motion-safe:hover:-translate-y-0.5 ${FOCUS}`}
              >
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3FD17F] [font:700_14px_JetBrains_Mono] text-[#0A0908]">
                    {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
                  </span>
                  <Icon aria-hidden className="h-5 w-5 shrink-0 text-[#3FD17F]" />
                  <h3 className="min-w-0 [font:700_20px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t(`verify.quest.${n}.title`)}</h3>
                </div>
                <p className="line-clamp-3 [font:400_13px/1.5_Inter] text-[#A0978A]">{t(`verify.summary.check${n}`)}</p>
                <span className="mt-auto inline-flex min-h-8 items-center gap-1.5 pt-1 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
                  {t('verify.quest.go')}
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform motion-safe:group-hover/quest:translate-x-0.5" />
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <details className={`${CARD} group`} data-testid="verify-addresses">
        <summary className={`flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-[14px] px-4 py-2 [font:600_13px_JetBrains_Mono] text-[#C9BFB0] hover:bg-[#1C1916] ${FOCUS} [&::-webkit-details-marker]:hidden`}>
          <KeyRound aria-hidden className="h-4 w-4 shrink-0 text-[#3FD17F]" />
          <span className="min-w-0 flex-1">{t('verify.addresses.summary', { n: count })}</span>
        </summary>
        <ul className="flex flex-col divide-y divide-[#262320] px-4 pb-3">
          <Address label={t('verify.summary.escrow')} value={ESCROW_PROGRAM} testId="verify-summary-escrow" />
          <Address label={t('verify.summary.core')} value={MPL_CORE_PROGRAM} testId="verify-summary-core" />
          {authority && <Address label={t('verify.summary.authority')} value={authority} testId="verify-summary-authority" />}
          {treasury && <Address label={t('verify.summary.treasury')} value={treasury} testId="verify-summary-treasury" />}
          <Address label={t('verify.summary.asset')} value={SAMPLE_ASSET} testId="verify-summary-asset" />
        </ul>
      </details>
    </section>
  );
}
