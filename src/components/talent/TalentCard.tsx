import { Link } from 'react-router-dom';
import { Chip, ShortWallet } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { plural } from '@/utils/bounty';
import { lamportsToSol, missionHref } from '@/utils/talent';
import { localizeDecimal } from '@/utils/shopPrice';
import type { TalentLearner } from '@/types/talent';

export function TalentCard({ learner }: { learner: TalentLearner }) {
  const { t, locale } = useI18n();
  const share = learner.totalDays > 0 ? Math.min(100, Math.round((learner.stampedDays / learner.totalDays) * 100)) : 0;
  const lastStamp = learner.lastStampAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(learner.lastStampAt)) : null;
  return (
    <article className={`${CARD} flex w-full min-w-0 flex-col gap-4 p-4 sm:p-5`} data-testid="talent-card">
      <header className="flex min-w-0 items-center gap-3">
        {learner.avatar ? (
          <img src={learner.avatar.thumbUrl} alt="" className="h-14 w-14 shrink-0 rounded-full bg-[#0A0908] object-cover ring-2 ring-[#262320]" loading="lazy" />
        ) : (
          <span aria-hidden className="h-14 w-14 shrink-0 rounded-full bg-[#1C1916] ring-2 ring-[#262320]" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate [font:700_26px/1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="talent-card-name">{learner.name ?? t('talent.card.noName')}</h2>
          <ShortWallet address={learner.wallet} />
        </div>
      </header>
      {learner.teamTest && (
        <span className={`self-start rounded-full border border-[#2E2A25] px-2.5 py-1 ${MONO_LABEL} text-[#A0978A]`} data-testid="talent-card-team-test">
          {t('talent.card.teamTest')}
        </span>
      )}
      {learner.headline && <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]" data-testid="talent-card-headline">{learner.headline}</p>}
      <div className="flex flex-col gap-2" data-testid="talent-card-days">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="[font:700_20px/1.1_'Barlow_Condensed'] text-[#3FD17F]">{t('talent.card.days', { n: learner.stampedDays, m: learner.totalDays })}</span>
          <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{plural(t, 'talent.card.certs', learner.certifications)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#1C1916]" aria-hidden>
          <div className="h-full rounded-full bg-[#3FD17F]" style={{ width: `${share}%` }} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('talent.card.capabilities')}</span>
        {learner.capabilities.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" data-testid="talent-card-capabilities">
            {learner.capabilities.slice(0, 6).map((entry) => (
              <li key={entry.key} className="min-w-0 max-w-full">
                <Chip title={entry.title}>{entry.title}</Chip>
              </li>
            ))}
            {learner.capabilities.length > 6 && <li><Chip>+{learner.capabilities.length - 6}</Chip></li>}
          </ul>
        ) : (
          <p className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('talent.card.noCapabilities')}</p>
        )}
      </div>
      <p className="[font:500_13px/1.4_JetBrains_Mono] text-[#C9BFB0]" data-testid="talent-card-paid">
        {learner.bountiesPaid > 0 ? plural(t, 'talent.card.paid', learner.bountiesPaid, { sol: localizeDecimal(lamportsToSol(learner.bountiesPaidLamports), locale) }) : t('talent.card.paid.none')}
      </p>
      {lastStamp && <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('talent.card.lastStamp', { date: lastStamp })}</p>}
      <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row">
        <Link to={learner.profileUrl} className={`${BTN_SECONDARY} ${BTN_SMALL} flex-1`} data-testid="talent-card-proof">
          {t('talent.card.viewProof')}
        </Link>
        <Link to={missionHref(learner.wallet)} className={`${BTN_PRIMARY} ${BTN_SMALL} flex-1`} data-testid="talent-card-mission">
          {t('talent.card.sendMission')}
        </Link>
      </div>
    </article>
  );
}
