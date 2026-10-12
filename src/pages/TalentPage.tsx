import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { BountyShell, LoadError, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { TalentCard } from '@/components/talent/TalentCard';
import { TalentFilters } from '@/components/talent/TalentFilters';
import { learnersOfTrail, parseTrail, type TalentTrail } from '@/components/talent/talentSkills';
import { skillFamily } from '@/components/skills/skillIcon';
import { TeraNote } from '@/components/tera/TeraNote';
import { useCompanyAccess, useTalentBoard } from '@/hooks/useTalent';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ChevronRight, Coins, Lock, PackageCheck, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { formatWhen, plural } from '@/utils/bounty';
import { parseMinDays } from '@/utils/talent';
import type { TalentFilters as Filters } from '@/types/talent';

const HOW = [
  { key: 'pick', Icon: UserRoundCheck },
  { key: 'lock', Icon: Lock },
  { key: 'deliver', Icon: PackageCheck },
  { key: 'pay', Icon: Coins },
] as const;

/** /talent: learners who opted in, as cards built from what they proved. Public, no session needed. */
export default function TalentPage() {
  const { t, locale } = useI18n();
  usePageTitle(t('talent.pageTitle'));
  const [params, setParams] = useSearchParams();
  const filters: Filters = { capability: params.get('capability') ?? '', minDays: parseMinDays(params.get('min_days')) };
  const board = useTalentBoard(filters);
  const trail = parseTrail(params.get('trail'));
  const filtered = filters.capability !== '' || filters.minDays > 0 || trail !== '';
  const setFilters = (next: Filters, nextTrail: TalentTrail | '' = trail) => {
    const query = new URLSearchParams();
    if (nextTrail) query.set('trail', nextTrail);
    if (next.capability) query.set('capability', next.capability);
    if (next.minDays > 0) query.set('min_days', String(next.minDays));
    setParams(query, { replace: true });
  };
  const learners = learnersOfTrail(board.data?.learners ?? [], trail);
  const company = useCompanyAccess().data ?? null;
  // The count the server sent back with the last contact shown, so the line above the cards stays true without another read.
  const [left, setLeft] = useState<number | null>(null);
  const contactRule = company?.isCompany ? t('privacy.board.company', { max: company.revealsPerDay, left: left ?? company.revealsLeftToday }) : t('privacy.board.visitor');

  return (
    <BountyShell>
      <section className="flex flex-col gap-3 pt-2" aria-labelledby="talent-hero">
        <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('talent.eyebrow')}</span>
        <h1 id="talent-hero" className="max-w-[760px] [font:700_52px/.98_'Barlow_Condensed'] max-sm:text-[38px]">{t('talent.hero.title')}</h1>
        <p className="max-w-[680px] [font:400_15px/1.45_Inter] text-[#C9BFB0]" data-testid="talent-intro">{t('talent.hero.line')}</p>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" data-testid="talent-how">
            {HOW.map(({ key, Icon }, index) => (
              <li key={key} className="flex items-center gap-1">
                {index > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#6F675C]" strokeWidth={2.4} />}
                <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#2E2A25] bg-[#141210] px-2.5 [font:700_11px/1_JetBrains_Mono] text-[#F4EDE2]" aria-hidden="true">
                  <Icon className="h-3.5 w-3.5 text-[#3FD17F]" strokeWidth={2.4} />
                  {t(`talent.how.${key}`)}
                </span>
              </li>
            ))}
            <li className="sr-only">{t('talent.hero.how')}</li>
          </ol>
          <details className="talent-contact group min-w-0 max-w-full" data-testid="talent-contact-rule" data-company={company?.isCompany === true}>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F] sm:min-h-8 [&::-webkit-details-marker]:hidden" title={contactRule}>
              <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#2E2A25] bg-[#141210] px-2.5 [font:700_11px/1_JetBrains_Mono] text-[#C9BFB0] group-open:border-[#3a352f] group-open:text-[#F4EDE2]">
                <Lock aria-hidden className="h-3.5 w-3.5 text-[#F2C66D]" strokeWidth={2.4} />
                {company?.isCompany ? t('talent.contact.company', { max: company.revealsPerDay, left: left ?? company.revealsLeftToday }) : t('talent.contact.visitor')}
              </span>
            </summary>
            <p className="mt-1.5 max-w-[560px] rounded-[12px] border border-[#2E2A25] bg-[#141210] px-3 py-2 [font:400_13px/1.5_Inter] text-[#C9BFB0]" data-testid="talent-contact-full">{contactRule}</p>
          </details>
        </div>
      </section>
      <TalentFilters filters={filters} trail={trail} capabilities={board.data?.capabilities ?? []} onChange={setFilters} />
      <p className="[font:500_12px/1.5_JetBrains_Mono] text-[#A0978A]" data-testid="talent-source">
        {t('talent.source')}
        {board.data?.readAt ? ` ${t('talent.readAt', { time: formatWhen(board.data.readAt, locale) })}.` : ''}
        {board.data && board.data.totalListed > 0 ? ` ${plural(t, 'talent.count', board.data.totalListed)}.` : ''}
      </p>
      {board.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true" data-testid="talent-loading">
          <p role="status" className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('talent.loading')}</p>
          <div className="grid gap-4 sm:grid-cols-2 min-[1100px]:grid-cols-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
            <Skeleton className="hidden h-72 min-[1100px]:block" />
          </div>
        </div>
      )}
      {board.isError && <LoadError onRetry={() => void board.refetch()} testId="talent-failed" />}
      {board.data && learners.length === 0 && (
        <div className={`${CARD} flex flex-col items-start gap-4 p-5`} data-testid="talent-empty">
          <TeraNote mood="neutral" title={t(filtered ? 'talent.emptyFiltered.title' : 'talent.empty.title')} body={t(filtered ? 'talent.emptyFiltered.body' : 'talent.empty.body')} className="!pt-2" />
          {!filtered && (
            <Link to="/" className={BTN_PRIMARY} data-testid="talent-empty-cta">
              {t('talent.empty.cta')}
            </Link>
          )}
        </div>
      )}
      {learners.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 min-[1100px]:grid-cols-3" data-testid="talent-list">
          {learners.map((learner) => (
            <li key={learner.wallet} className="flex min-w-0">
              <TalentCard learner={learner} company={company} onRevealed={setLeft} activeSkill={filters.capability} onPickSkill={(key) => setFilters({ ...filters, capability: filters.capability === key ? '' : key }, skillFamily(key) === trail ? trail : '')} />
            </li>
          ))}
        </ul>
      )}
    </BountyShell>
  );
}
