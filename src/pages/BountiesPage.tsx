import { ChevronRight, Coins, Lock, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BountyCard } from '@/components/bounty/BountyCard';
import { InviteInbox } from '@/components/bounty/InviteInbox';
import { JudgeBoardBlock } from '@/components/bounty/JudgeParts';
import { BountyShell, Fold, LINK, LoadError, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { TeraNote } from '@/components/tera/TeraNote';
import { useBountyBoard, useBountySession } from '@/hooks/useBounties';
import { useIsBountyStaff } from '@/hooks/useIsBountyStaff';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { splitBoard } from '@/components/bounty/boardSplit';
import { formatWhen, hiddenTestsLine, plural, sortBounties } from '@/utils/bounty';
import { daysFooter, judgeBoardTitle, judgePaidHint, openHint } from '@/utils/bountyJudge';
import { localizeDecimal } from '@/utils/shopPrice';
import type { BountyStats } from '@/types/bounty';

const HERO_STEPS = [
  { id: 'lock', Icon: Lock },
  { id: 'gate', Icon: ShieldCheck },
  { id: 'pay', Icon: Coins },
] as const;

function Stat({ label, value, source, testId }: { label: string; value: string; source: string; testId: string }) {
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-1 p-3 sm:p-4`} data-testid={testId}>
      <span className="[font:600_10px/1.2_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] sm:text-[11px]">{label}</span>
      <span className="[font:700_34px/1_'Barlow_Condensed'] text-[#3FD17F] [overflow-wrap:anywhere] max-sm:text-[26px]">{value}</span>
      <span className="[font:500_10px/1.3_JetBrains_Mono] text-[#A0978A]" data-testid={`${testId}-source`}>{source}</span>
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
  const board = useBountyBoard({ live: true });
  const staff = useIsBountyStaff();
  const stats = board.data?.stats;
  const items = board.data ? sortBounties(board.data.bounties) : [];
  const { live, closed } = splitBoard(items);
  const hiddenTests = hiddenTestsLine(t, stats, items.length);
  const footer = stats ? daysFooter(t, stats) : null;
  const teamPaid = Boolean(stats) && ((stats?.rehearsalPaidCount ?? 0) > 0 || (stats?.judgeTeamTestPaidCount ?? 0) > 0);
  const judgeLine = board.data && (board.data.stats.judgePaidCount > 0 || board.data.judge.latest.length > 0) ? judgeBoardTitle(t, { outside: board.data.stats.judgePaidCount, teamTests: board.data.stats.judgeTeamTestPaidCount ?? 0, listed: board.data.judge.latest.length }) : null;

  return (
    <BountyShell>
      {signedIn && <InviteInbox />}
      <section className="flex flex-col gap-4 pt-2" aria-labelledby="bounty-hero">
        <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('bounty.eyebrow')}</span>
        <h1 id="bounty-hero" className="max-w-[760px] [font:700_60px/.98_'Barlow_Condensed'] max-sm:text-[44px]">{t('bounty.hero.title')}</h1>
        <p className="max-w-[640px] [font:400_16px/1.4_Inter] text-[#C9BFB0]" data-testid="bounty-hero-line">{t('bounty.hero.line')}</p>
        <ol className="grid max-w-[640px] grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-1.5" aria-label={t('bounty.fold.how')} data-testid="bounty-hero-steps">
          {HERO_STEPS.map(({ id, Icon }, index) => (
            <li key={id} className="flex min-w-0 items-center gap-1.5 max-sm:items-stretch" title={t(`bounty.hero.step.${id}.full`)}>
              {index > 0 && <span aria-hidden className="[font:700_13px_JetBrains_Mono] text-[#5E574E] max-sm:hidden">→</span>}
              <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[12px] border border-[#2E2A25] bg-[#141210] max-sm:flex-col max-sm:justify-center max-sm:px-1.5 max-sm:py-2 max-sm:text-center sm:h-8 sm:rounded-full sm:pl-1 sm:pr-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#3FD17F]/60 bg-[#3FD17F]/10 text-[#3FD17F] max-sm:h-8 max-sm:w-8">
                  <Icon aria-hidden className="h-3 w-3 max-sm:h-4 max-sm:w-4" strokeWidth={2.4} />
                </span>
                <span className="[font:600_11px/1.25_JetBrains_Mono] text-[#F4EDE2]">
                  <span className="text-[#A0978A] sm:hidden">{index + 1}. </span>
                  {t(`bounty.hero.step.${id}`)}
                </span>
              </span>
            </li>
          ))}
        </ol>
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
        <Link to="/talent" className={LINK} data-testid="bounty-talent-link">
          {t('talent.bounties.line')} →
        </Link>
        {staff && (
          <Link to="/bounties/manage" className={LINK} data-testid="bounty-manage-link">
            {t('bounty.manage.link')} →
          </Link>
        )}
      </section>
      <section className="flex flex-col gap-1" aria-label={t('bounty.stats.aria')}>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat testId="bounty-stat-locked" label={t('bounty.stats.short.locked')} value={stats ? localizeDecimal(stats.lockedSol, locale) : '—'} source={t('bounty.stats.source.chain')} />
          <Stat testId="bounty-stat-paid" label={t('bounty.stats.short.paid')} value={stats ? localizeDecimal(stats.paidSol, locale) : '—'} source={stats ? plural(t, teamPaid ? 'bounty.stats.source.paidTeam' : 'bounty.stats.source.paid', stats.paidCount) : t('bounty.stats.source.chain')} />
          <Stat testId="bounty-stat-open" label={t('bounty.stats.short.open')} value={stats ? String(stats.openCount) : '—'} source={stats && stats.heldCount > 0 ? t('bounty.stats.source.held', { held: stats.heldCount }) : t('bounty.stats.source.now')} />
        </div>
        <Fold label={t('bounty.fold.numbers')} testId="bounty-stats-how">
          {board.data?.readAt && <p data-testid="bounty-read-at">{t('bounty.stats.readAt', { time: formatWhen(board.data.readAt, locale) })}</p>}
          <p data-testid="bounty-stat-locked-hint"><strong className="text-[#C9BFB0]">{t('bounty.stats.locked')}:</strong> {t('bounty.stats.lockedHint')}</p>
          <p data-testid="bounty-stat-paid-hint"><strong className="text-[#C9BFB0]">{t('bounty.stats.paid')}:</strong> {(stats && judgePaidHint(t, stats)) ?? paidHint(stats, t)}</p>
          <p data-testid="bounty-stat-open-hint"><strong className="text-[#C9BFB0]">{t('bounty.stats.open')}:</strong> {stats ? openHint(t, { bounties: items.filter((item) => item.status === 'open').length, places: stats.openCount, held: stats.heldCount }) : t('bounty.stats.openHint')}</p>
          {hiddenTests && <p data-testid="bounty-hidden-tests">{hiddenTests}</p>}
          {judgeLine && <p data-testid="bounty-judge-counters">{judgeLine}</p>}
        </Fold>
      </section>
      {board.data && <JudgeBoardBlock judge={board.data.judge} paidCount={board.data.stats.judgePaidCount} teamTestCount={board.data.stats.judgeTeamTestPaidCount ?? 0} />}
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
      {live.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 min-[1536px]:grid-cols-3" data-testid="bounty-list">
          {live.map((bounty) => (
            <li key={bounty.id} className="flex min-w-0">
              <BountyCard bounty={bounty} />
            </li>
          ))}
        </ul>
      )}
      {board.data && items.length > 0 && live.length === 0 && (
        <p className="[font:500_14px_Inter] text-[#A0978A]" data-testid="bounty-none-open">{t('bounty.board.noneOpen')}</p>
      )}
      {closed.length > 0 && (
        <details className="group/closed min-w-0" data-testid="bounty-closed" data-count={closed.length}>
          <summary className={`flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[14px] border border-[#262320] bg-[#141210] px-4 [font:700_22px/1_'Barlow_Condensed'] text-[#C9BFB0] hover:border-[#5E574E] [&::-webkit-details-marker]:hidden ${FOCUS}`}>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 transition-transform group-open/closed:rotate-90" />
            {t('bounty.board.closed', { n: closed.length })}
          </summary>
          <ul className="grid gap-4 pt-4 sm:grid-cols-2 min-[1536px]:grid-cols-3" data-testid="bounty-closed-list">
            {closed.map((bounty) => (
              <li key={bounty.id} className="flex min-w-0">
                <BountyCard bounty={bounty} />
              </li>
            ))}
          </ul>
        </details>
      )}
      <Fold label={t('bounty.fold.how')} testId="bounty-how" className="border-t border-[#262320] pt-3">
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[#C9BFB0]" data-testid="bounty-hero-sub">
          {HERO_STEPS.map(({ id }) => (
            <li key={id}>{t(`bounty.hero.step.${id}.full`)}</li>
          ))}
        </ol>
        <p data-testid="bounty-custody">{t('bounty.custody')}</p>
        {footer && <p data-testid="bounty-days-footer">{footer}</p>}
        <Link to="/verify#gate" className={LINK} data-testid="bounty-how-gate">
          {t('verify.link')} →
        </Link>
      </Fold>
    </BountyShell>
  );
}
