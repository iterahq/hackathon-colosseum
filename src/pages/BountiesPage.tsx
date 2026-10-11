import { useState, type ReactNode } from 'react';
import { Coins, Lock, ShieldCheck, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FeaturedQuest } from '@/components/bounty/FeaturedQuest';
import { QuestCard } from '@/components/bounty/QuestCard';
import { JudgeBoardBlock } from '@/components/bounty/JudgeParts';
import { BountyShell, LINK, LoadError, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { TeraNote } from '@/components/tera/TeraNote';
import { useBountyBoard, useBountySession } from '@/hooks/useBounties';
import { useIsBountyStaff } from '@/hooks/useIsBountyStaff';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { formatWhen, hiddenTestsLine, plural, sortBounties } from '@/utils/bounty';
import { BOARD_TABS, defaultTab, splitBoard, type BoardTab } from '@/utils/bountyBoard';
import { daysFooter, judgePaidHint, openHint } from '@/utils/bountyJudge';
import { localizeDecimal } from '@/utils/shopPrice';
import type { BountyStats } from '@/types/bounty';

function Stat({ icon, label, value, hint, testId }: { icon: ReactNode; label: string; value: string; hint: string; testId: string }) {
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-1 p-3 sm:p-4`} data-testid={testId} title={hint}>
      <span className="flex items-start gap-1.5 text-[#A0978A]">
        <span className="mt-px shrink-0">{icon}</span>
        <span className={`${MONO_LABEL} min-w-0 leading-[1.25] max-sm:text-[10px]`}>{label}</span>
      </span>
      <span className="[font:700_32px/1_'Barlow_Condensed'] text-[#3FD17F] [overflow-wrap:anywhere] max-sm:text-[26px]">{value}</span>
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
  const [picked, setPicked] = useState<BoardTab | null>(null);
  const stats = board.data?.stats;
  const items = board.data ? sortBounties(board.data.bounties) : [];
  const { featured, tabs } = splitBoard(items);
  const active = picked ?? defaultTab(tabs);
  const shown = tabs[active];
  const hiddenTests = hiddenTestsLine(t, stats, items.length);
  const footer = stats ? daysFooter(t, stats) : null;
  const lockedHint = t('bounty.stats.lockedHint');
  const paidHintText = (stats && judgePaidHint(t, stats)) ?? paidHint(stats, t);
  const openHintText = stats ? openHint(t, { bounties: items.filter((item) => item.status === 'open').length, places: stats.openCount, held: stats.heldCount }) : t('bounty.stats.openHint');
  const payoutCount = stats ? stats.judgePaidCount + (stats.judgeTeamTestPaidCount ?? 0) : 0;
  const showFeed = board.data && (board.data.stats.judgePaidCount > 0 || board.data.judge.latest.length > 0);

  return (
    <BountyShell>
      <section className="flex flex-col gap-3 pt-2 md:flex-row md:items-end md:justify-between md:gap-6" aria-labelledby="bounty-hero">
        <div className="flex min-w-0 flex-col gap-2">
          <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('bounty.eyebrow')}</span>
          <h1 id="bounty-hero" className="max-w-[560px] [font:700_40px/1_'Barlow_Condensed'] max-sm:text-[32px]">{t('bounty.hero.title')}</h1>
          <p className="max-w-[560px] [font:400_15px/1.45_Inter] text-[#C9BFB0]">{t('bounty.hero.short')}</p>
          <Link to="/talent" className={`${LINK} self-start`} data-testid="bounty-talent-link">
            {t('talent.bounties.line')} →
          </Link>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link to="/bounties/post" className={BTN_PRIMARY} data-testid="bounty-post-cta">
            {t('bounty.hero.post')}
          </Link>
          {signedIn && (
            <Link to="/bounties/mine" className={BTN_SECONDARY} data-testid="bounty-mine-cta">
              {t('bounty.hero.mine')}
            </Link>
          )}
          {staff && (
            <Link to="/bounties/manage" className={LINK} data-testid="bounty-manage-link">
              {t('bounty.manage.link')} →
            </Link>
          )}
        </div>
      </section>
      <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={t('bounty.stats.aria')}>
        <Stat testId="bounty-stat-locked" icon={<Lock aria-hidden size={14} className="shrink-0" />} label={t('bounty.stats.locked')} value={stats ? localizeDecimal(stats.lockedSol, locale) : '—'} hint={lockedHint} />
        <Stat testId="bounty-stat-paid" icon={<Coins aria-hidden size={14} className="shrink-0" />} label={t('bounty.stats.paid')} value={stats ? localizeDecimal(stats.paidSol, locale) : '—'} hint={paidHintText} />
        <Stat testId="bounty-stat-open" icon={<Target aria-hidden size={14} className="shrink-0" />} label={t('bounty.stats.open')} value={stats ? String(stats.openCount) : '—'} hint={openHintText} />
      </section>
      {showFeed && board.data && (
        <details className={`${CARD} group`}>
          <summary className={`flex min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center gap-2 px-4 ${MONO_LABEL} text-[#F2C66D] ${FOCUS}`}>
            <Coins aria-hidden size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">{t('bounty.feed.summary', { n: payoutCount })}</span>
          </summary>
          <div className="border-t border-[#262320] p-4">
            <JudgeBoardBlock judge={board.data.judge} paidCount={board.data.stats.judgePaidCount} teamTestCount={board.data.stats.judgeTeamTestPaidCount ?? 0} />
          </div>
        </details>
      )}
      {board.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true" data-testid="bounty-loading">
          <p role="status" className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('bounty.board.reading')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="hidden h-56 lg:block" />
          </div>
        </div>
      )}
      {board.isError && <LoadError onRetry={() => void board.refetch()} testId="bounty-failed" />}
      {board.data && items.length === 0 && (
        <div className={`${CARD} p-5`} data-testid="bounty-empty">
          <TeraNote mood="neutral" title={t('bounty.empty.title')} body={t('bounty.empty.body')} className="!pt-2" />
        </div>
      )}
      {featured && <FeaturedQuest bounty={featured} />}
      {items.length > 0 && (
        <>
          <div role="tablist" aria-label={t('bounty.tab.aria')} className="-mb-2 flex gap-2 overflow-x-auto" data-testid="bounty-tabs">
            {BOARD_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`bounty-tab-${id}`}
                aria-selected={active === id}
                aria-controls="bounty-tabpanel"
                onClick={() => setPicked(id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 sm:gap-2 sm:px-4 [font:700_13px_JetBrains_Mono] ${active === id ? 'border-[#3FD17F] bg-[#3FD17F]/15 text-[#3FD17F]' : 'border-[#2E2A25] text-[#C9BFB0] hover:border-[#5E574E]'} ${FOCUS}`}
                data-testid={`bounty-tab-${id}`}
              >
                {t(`bounty.tab.${id}`)}
                <span className="rounded-full bg-[#1C1916] px-1.5 py-0.5 text-[11px] text-[#A0978A]">{tabs[id].length}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id="bounty-tabpanel" aria-labelledby={`bounty-tab-${active}`}>
            {shown.length === 0 ? (
              <p className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('bounty.tab.empty')}</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="bounty-list">
                {shown.map((bounty) => (
                  <li key={bounty.id} className="flex min-w-0">
                    <QuestCard bounty={bounty} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <details className="border-t border-[#262320] pt-3" data-testid="bounty-fine-print">
        <summary className={`flex min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center gap-2 [font:500_13px/1.4_Inter] text-[#A0978A] ${FOCUS}`}>
          <ShieldCheck aria-hidden size={16} className="shrink-0 text-[#3FD17F]" />
          <span className="min-w-0 flex-1">{t('bounty.finePrint.summary')}</span>
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          <p className="max-w-[640px] [font:400_13px/1.55_Inter] text-[#C9BFB0]">{t('bounty.hero.sub')}</p>
          <div className="flex flex-col gap-1">
            <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.finePrint.numbers')}</span>
            <ul className="flex flex-col gap-1 [font:400_13px/1.5_Inter] text-[#A0978A]">
              <li><strong className="font-semibold text-[#C9BFB0]">{t('bounty.stats.locked')}:</strong> {lockedHint}</li>
              <li><strong className="font-semibold text-[#C9BFB0]">{t('bounty.stats.paid')}:</strong> {paidHintText}</li>
              <li><strong className="font-semibold text-[#C9BFB0]">{t('bounty.stats.open')}:</strong> {openHintText}</li>
            </ul>
          </div>
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
          <p className="[font:400_13px/1.55_Inter] text-[#A0978A]" data-testid="bounty-custody">{t('bounty.custody')}</p>
          {footer && <p className="[font:400_13px/1.55_Inter] text-[#A0978A]" data-testid="bounty-days-footer">{footer}</p>}
        </div>
      </details>
    </BountyShell>
  );
}
