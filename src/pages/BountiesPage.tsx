import { Link } from 'react-router-dom';
import { BountyCard } from '@/components/bounty/BountyCard';
import { BountyShell, LINK, LoadError, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { TeraNote } from '@/components/tera/TeraNote';
import { useBountyBoard, useBountySession } from '@/hooks/useBounties';
import { useIsBountyStaff } from '@/hooks/useIsBountyStaff';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { formatWhen, hiddenTestsLine, plural, sortBounties } from '@/utils/bounty';
import type { BountyStats } from '@/types/bounty';

function Stat({ label, value, hint, testId }: { label: string; value: string; hint: string; testId: string }) {
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-1 p-4`} data-testid={testId}>
      <span className={`${MONO_LABEL} text-[#A0978A]`}>{label}</span>
      <span className="[font:700_34px/1_'Barlow_Condensed'] text-[#3FD17F] [overflow-wrap:anywhere]">{value}</span>
      <span className="[font:400_12px/1.4_Inter] text-[#A0978A]">{hint}</span>
    </div>
  );
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function paidHint(stats: BountyStats | undefined, t: Translate): string {
  if (!stats) return t('bounty.stats.paidHint.outside');
  if (stats.paidCount === 0) return t('bounty.stats.paidHint.none');
  if (stats.rehearsalPaidCount === 0) return t('bounty.stats.paidHint.outside');
  if (stats.outsidePaidCount === 0) return plural(t, 'bounty.stats.paidHint.rehearsal', stats.rehearsalPaidCount);
  return plural(t, 'bounty.stats.paidHint.mixed', stats.rehearsalPaidCount, { outside: stats.outsidePaidCount });
}

/** /bounties: the public board of paid tasks. No session needed. */
export default function BountiesPage() {
  const { t, locale } = useI18n();
  usePageTitle(t('bounty.pageTitle'));
  const { signedIn } = useBountySession();
  const board = useBountyBoard();
  const staff = useIsBountyStaff();
  const stats = board.data?.stats;
  const items = board.data ? sortBounties(board.data.bounties) : [];
  const hiddenTests = hiddenTestsLine(t, stats, items.length);

  return (
    <BountyShell>
      <section className="flex flex-col gap-4 pt-2" aria-labelledby="bounty-hero">
        <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('bounty.eyebrow')}</span>
        <h1 id="bounty-hero" className="max-w-[760px] [font:700_60px/.98_'Barlow_Condensed'] max-sm:text-[44px]">{t('bounty.hero.title')}</h1>
        <p className="max-w-[640px] [font:400_16px/1.55_Inter] text-[#C9BFB0]">{t('bounty.hero.sub')}</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/bounties/post" className={BTN_PRIMARY} data-testid="bounty-post-cta">
            {t('bounty.hero.post')}
          </Link>
          {signedIn && (
            <Link to="/bounties/mine" className={BTN_SECONDARY} data-testid="bounty-mine-cta">
              {t('bounty.hero.mine')}
            </Link>
          )}
        </div>
        {staff && (
          <Link to="/bounties/manage" className={LINK} data-testid="bounty-manage-link">
            {t('bounty.manage.link')} →
          </Link>
        )}
      </section>
      <section className="grid gap-3 sm:grid-cols-3" aria-label={t('bounty.stats.aria')}>
        <Stat testId="bounty-stat-locked" label={t('bounty.stats.locked')} value={stats?.lockedSol ?? '—'} hint={t('bounty.stats.lockedHint')} />
        <Stat testId="bounty-stat-paid" label={t('bounty.stats.paid')} value={stats?.paidSol ?? '—'} hint={paidHint(stats, t)} />
        <Stat testId="bounty-stat-open" label={t('bounty.stats.open')} value={stats ? String(stats.openCount) : '—'} hint={stats && stats.heldCount > 0 ? t('bounty.stats.openHintHeld', { held: stats.heldCount }) : t('bounty.stats.openHint')} />
      </section>
      {board.data?.readAt && (
        <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="bounty-read-at">
          {t('bounty.stats.readAt', { time: formatWhen(board.data.readAt, locale) })}
        </p>
      )}
      {hiddenTests && (
        <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="bounty-hidden-tests">
          {hiddenTests}
        </p>
      )}
      {board.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true" data-testid="bounty-loading">
          <p role="status" className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('bounty.board.reading')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      )}
      {board.isError && <LoadError onRetry={() => void board.refetch()} testId="bounty-failed" />}
      {board.data && items.length === 0 && (
        <div className={`${CARD} p-5`} data-testid="bounty-empty">
          <TeraNote mood="neutral" title={t('bounty.empty.title')} body={t('bounty.empty.body')} className="!pt-2" />
        </div>
      )}
      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 min-[1536px]:grid-cols-3" data-testid="bounty-list">
          {items.map((bounty) => (
            <li key={bounty.id} className="flex">
              <BountyCard bounty={bounty} />
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-[#262320] pt-5 [font:400_13px/1.55_Inter] text-[#A0978A]" data-testid="bounty-custody">{t('bounty.custody')}</p>
    </BountyShell>
  );
}
