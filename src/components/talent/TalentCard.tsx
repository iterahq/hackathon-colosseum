import { Award, CalendarCheck, Coins } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShortWallet } from '@/components/bounty/bountyUi';
import { TierChips } from '@/components/graph/TierMedal';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { SkillBadge } from '@/components/skills/SkillBadge';
import { skillShortTitle } from '@/components/skills/skillLabels';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { plural } from '@/utils/bounty';
import { lamportsToSol, missionHref } from '@/utils/talent';
import { localizeDecimal } from '@/utils/shopPrice';
import type { CompanyAccess } from '@/types/privacy';
import type { TalentLearner } from '@/types/talent';
import { ContactReveal } from './ContactReveal';
import { CARD_SKILLS, advancedFirst, capabilityTier, cardTierCounts } from './talentSkills';

const RING = 2 * Math.PI * 19;
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]';

function Stat({ icon, value, label, dim = false, testId }: { icon: ReactNode; value: string; label: string; dim?: boolean; testId?: string }) {
  return (
    <span title={label} className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#262320] bg-[#0A0908] px-2.5 [font:700_12px/1_JetBrains_Mono] ${dim ? 'text-[#6F675C]' : 'text-[#F4EDE2]'}`} data-testid={testId}>
      {icon}
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface Props {
  learner: TalentLearner;
  /** The signed-in account may ask for contacts; without it the card draws nothing about a contact. */
  company?: CompanyAccess | null;
  onRevealed?: (left: number) => void;
  /** The skill the board is filtered by, lit on the card. */
  activeSkill?: string;
  onPickSkill?: (key: string) => void;
}

export function TalentCard({ learner, company = null, onRevealed, activeSkill = '', onPickSkill }: Props) {
  const { t, locale } = useI18n();
  const ratio = learner.totalDays > 0 ? Math.min(1, learner.stampedDays / learner.totalDays) : 0;
  const lastStamp = learner.lastStampAt ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(learner.lastStampAt)) : null;
  const skills = advancedFirst(learner.capabilities);
  const hidden = skills.length - CARD_SKILLS;
  const tiers = cardTierCounts(learner.capabilities);
  const days = t('talent.card.days', { n: learner.stampedDays, m: learner.totalDays });
  const paid = learner.bountiesPaid > 0 ? plural(t, 'talent.card.paid', learner.bountiesPaid, { sol: localizeDecimal(lamportsToSol(learner.bountiesPaidLamports), locale) }) : t('talent.card.paid.none');

  return (
    <article className={`${CARD} flex w-full min-w-0 flex-col gap-3.5 p-4 sm:p-5`} data-testid="talent-card">
      <header className="flex min-w-0 items-center gap-3">
        {learner.avatar ? (
          <img src={learner.avatar.thumbUrl} alt="" className="h-14 w-14 shrink-0 rounded-full bg-[#0A0908] object-cover ring-2 ring-[#262320]" loading="lazy" />
        ) : (
          <span aria-hidden className="h-14 w-14 shrink-0 rounded-full bg-[#1C1916] ring-2 ring-[#262320]" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate [font:700_26px/1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="talent-card-name">{learner.name ?? shortAddress(learner.wallet)}</h2>
          <ShortWallet address={learner.wallet} />
        </div>
        <span className="relative grid h-[52px] w-[52px] shrink-0 place-items-center" title={days} data-testid="talent-card-days">
          <svg width="52" height="52" viewBox="0 0 48 48" className="absolute inset-0" aria-hidden="true">
            <circle cx="24" cy="24" r="19" fill="none" stroke="#262320" strokeWidth="5" />
            <circle cx="24" cy="24" r="19" fill="none" stroke="#3FD17F" strokeWidth="5" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - ratio)} transform="rotate(-90 24 24)" style={{ filter: 'drop-shadow(0 0 4px rgba(63,209,127,.5))' }} />
          </svg>
          <span className="[font:700_14px/1_'Barlow_Condensed'] text-[#F4EDE2]" aria-hidden="true">{learner.stampedDays}/{learner.totalDays}</span>
          <span className="sr-only">{days}</span>
        </span>
      </header>
      {learner.teamTest && (
        <span className={`self-start rounded-full border border-[#2E2A25] px-2.5 py-1 ${MONO_LABEL} text-[#A0978A]`} data-testid="talent-card-team-test">
          {t('talent.card.teamTest')}
        </span>
      )}
      {learner.headline && <p className="line-clamp-2 [font:400_14px/1.45_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]" data-testid="talent-card-headline">{learner.headline}</p>}
      {skills.length > 0 ? (
        <ul className="flex flex-wrap gap-x-1.5" aria-label={t('talent.card.capabilities')} data-testid="talent-card-capabilities">
          {skills.slice(0, CARD_SKILLS).map((entry, index) => {
            const tier = capabilityTier(entry);
            return (
              <li key={entry.key} className="min-w-0 max-w-full">
                <button type="button" onClick={() => onPickSkill?.(entry.key)} aria-pressed={activeSkill === entry.key} aria-label={t('talent.filters.skill', { title: entry.title })} className={`inline-flex min-h-11 max-w-full items-center rounded-full ${FOCUS}`} data-testid="talent-card-skill" data-skill={entry.key}>
                  <SkillBadge claimId={entry.key} title={skillShortTitle(entry.key, locale, entry.title)} hint={entry.title} state={activeSkill === '' || activeSkill === entry.key ? 'lit' : 'neutral'} tier={tier} tierLabel={tier ? t(`graph.tier.${tier}`) : undefined} animate index={index} />
                </button>
              </li>
            );
          })}
          {hidden > 0 && (
            <li className="inline-flex min-h-11 items-center">
              <span className="inline-flex h-8 items-center rounded-full border border-[#2E2A25] bg-[#1C1916] px-2.5 [font:700_11px/1_JetBrains_Mono] text-[#C9BFB0]" title={t('talent.card.moreSkills', { n: hidden })} data-testid="talent-card-more">
                <span aria-hidden="true">+{hidden}</span>
                <span className="sr-only">{t('talent.card.moreSkills', { n: hidden })}</span>
              </span>
            </li>
          )}
        </ul>
      ) : (
        <p className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('talent.card.noCapabilities')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {tiers && <TierChips counts={tiers} compact testId="talent-card-tiers" />}
        <Stat icon={<Award aria-hidden className="h-3.5 w-3.5 text-[#F2C66D]" strokeWidth={2.2} />} value={String(learner.certifications)} label={plural(t, 'talent.card.certs', learner.certifications)} testId="talent-card-certs" />
        <Stat icon={<Coins aria-hidden className="h-3.5 w-3.5 text-[#3FD17F]" strokeWidth={2.2} />} value={learner.bountiesPaid > 0 ? `${learner.bountiesPaid} · ${localizeDecimal(lamportsToSol(learner.bountiesPaidLamports), locale)} SOL` : '0'} label={paid} dim={learner.bountiesPaid === 0} testId="talent-card-paid" />
        {lastStamp && <Stat icon={<CalendarCheck aria-hidden className="h-3.5 w-3.5 text-[#A0978A]" strokeWidth={2.2} />} value={lastStamp} label={t('talent.card.lastStamp', { date: lastStamp })} testId="talent-card-last" />}
      </div>
      {company?.isCompany && <ContactReveal wallet={learner.wallet} hasContact={learner.hasContact === true} revealsPerDay={company.revealsPerDay} onRevealed={onRevealed} />}
      <div className="mt-auto flex flex-col gap-2 pt-1">
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
