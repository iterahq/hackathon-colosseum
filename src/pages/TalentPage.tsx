import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { BountyShell, LoadError, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { TalentCard } from '@/components/talent/TalentCard';
import { TalentFilters } from '@/components/talent/TalentFilters';
import { TeraNote } from '@/components/tera/TeraNote';
import { useCompanyAccess, useTalentBoard } from '@/hooks/useTalent';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { formatWhen, plural } from '@/utils/bounty';
import { parseMinDays } from '@/utils/talent';
import type { TalentFilters as Filters } from '@/types/talent';

/** /talent: learners who opted in, as cards built from what they proved. Public, no session needed. */
export default function TalentPage() {
  const { t, locale } = useI18n();
  usePageTitle(t('talent.pageTitle'));
  const [params, setParams] = useSearchParams();
  const filters: Filters = { capability: params.get('capability') ?? '', minDays: parseMinDays(params.get('min_days')) };
  const board = useTalentBoard(filters);
  const filtered = filters.capability !== '' || filters.minDays > 0;
  const setFilters = (next: Filters) => {
    const query = new URLSearchParams();
    if (next.capability) query.set('capability', next.capability);
    if (next.minDays > 0) query.set('min_days', String(next.minDays));
    setParams(query, { replace: true });
  };
  const learners = board.data?.learners ?? [];
  const company = useCompanyAccess().data ?? null;
  // The count the server sent back with the last contact shown, so the line above the cards stays true without another read.
  const [left, setLeft] = useState<number | null>(null);

  return (
    <BountyShell>
      <section className="flex flex-col gap-4 pt-2" aria-labelledby="talent-hero">
        <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('talent.eyebrow')}</span>
        <h1 id="talent-hero" className="max-w-[760px] [font:700_60px/.98_'Barlow_Condensed'] max-sm:text-[44px]">{t('talent.hero.title')}</h1>
        <p className="max-w-[680px] [font:400_16px/1.55_Inter] text-[#C9BFB0]" data-testid="talent-intro">{t('talent.hero.sub')}</p>
        <p className="max-w-[680px] [font:500_14px/1.55_Inter] text-[#F4EDE2]" data-testid="talent-how">{t('talent.hero.how')}</p>
      </section>
      <p className="max-w-[680px] rounded-[12px] border border-[#2E2A25] bg-[#141210] px-3 py-2 [font:400_13px/1.5_Inter] text-[#C9BFB0]" data-testid="talent-contact-rule" data-company={company?.isCompany === true}>
        {company?.isCompany ? t('privacy.board.company', { max: company.revealsPerDay, left: left ?? company.revealsLeftToday }) : t('privacy.board.visitor')}
      </p>
      <TalentFilters filters={filters} capabilities={board.data?.capabilities ?? []} onChange={setFilters} />
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
              <TalentCard learner={learner} company={company} onRevealed={setLeft} />
            </li>
          ))}
        </ul>
      )}
    </BountyShell>
  );
}
