import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import { CopyButton } from '@/components/passport/CopyButton';
import { DEVNET_BADGE, FOCUS, MONO_LABEL, SHOP_GRID } from '@/components/shop/shopStyles';
import { useBountySession } from '@/hooks/useBounties';
import { HeaderLocale } from '@/components/header/HeaderLocale';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { statusTone, type StatusTone } from '@/utils/bounty';
import type { BountyStatus } from '@/types/bounty';

export const INPUT =
  'min-h-11 w-full rounded-[10px] border border-[#2E2A25] bg-[#0A0908] px-3 py-2 [font:500_14px_Inter] text-[#F4EDE2] placeholder:text-[#5E574E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#3FD17F]';
export const LABEL = `${MONO_LABEL} text-[#A0978A]`;
export const LINK = `inline-flex min-h-11 items-center rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`;
export const SECTION_TITLE = "[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]";

const TONES: Record<StatusTone, string> = {
  open: 'border-[#3FD17F] bg-[#3FD17F]/15 text-[#3FD17F]',
  progress: 'border-[#F2C66D]/60 bg-[#F2C66D]/10 text-[#F2C66D]',
  paid: 'border-[#F4EDE2]/50 bg-[#F4EDE2]/10 text-[#F4EDE2]',
  muted: 'border-[#2E2A25] bg-transparent text-[#A0978A]',
};

export function StatusChip({ status }: { status: BountyStatus }) {
  const { t } = useI18n();
  const tone = statusTone(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${MONO_LABEL} ${TONES[tone]}`} data-testid={`bounty-status-${status}`}>
      {tone === 'open' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#3FD17F]" />}
      {t(`bounty.status.${status}`)}
    </span>
  );
}

export function DevnetTag() {
  const { t } = useI18n();
  return <span className={DEVNET_BADGE}>{t('bounty.devnet')}</span>;
}

export function Reward({ sol, size = 'lg' }: { sol: string; size?: 'lg' | 'xl' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${size === 'xl' ? "[font:700_56px/1_'Barlow_Condensed'] max-sm:text-[44px]" : "[font:700_40px/1_'Barlow_Condensed']"} text-[#3FD17F]`} data-testid="bounty-reward">
        {sol}
      </span>
      <DevnetTag />
    </span>
  );
}

export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center rounded-full border border-[#2E2A25] bg-[#1C1916] px-3 py-1.5 [font:500_12px/1.2_JetBrains_Mono] text-[#C9BFB0]">
      <span className="truncate">{children}</span>
    </span>
  );
}

export function RequirementChip({ trail, minDays }: { trail: string; minDays: number }) {
  const { t } = useI18n();
  return <Chip>{t(minDays === 1 ? 'bounty.req.one' : 'bounty.req.many', { trail, n: minDays })}</Chip>;
}

export function ExplorerAnchor({ href, label }: { href: string | null; label?: string }) {
  const { t } = useI18n();
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {label ?? t('bounty.explorer')} ↗
    </a>
  );
}

export function ShortWallet({ address }: { address: string }) {
  return (
    <span className="[font:500_12px_JetBrains_Mono] text-[#C9BFB0]" title={address}>
      {shortAddress(address)}
    </span>
  );
}

export function CopyAddress({ address }: { address: string }) {
  const { t } = useI18n();
  return <CopyButton value={address} label={t('bounty.copy')} doneLabel={t('bounty.copied')} display={shortAddress(address)} />;
}

export function Notice({ tone = 'info', children, testId }: { tone?: 'info' | 'error' | 'good'; children: ReactNode; testId?: string }) {
  const edge = tone === 'error' ? 'border-[#E0655A]' : tone === 'good' ? 'border-[#3FD17F]' : 'border-[#2E2A25]';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[12px] border ${edge} bg-[#0A0908] p-3.5 [font:500_14px/1.45_Inter] text-[#C9BFB0]`} data-testid={testId}>
      {children}
    </div>
  );
}

export function LoadError({ onRetry, testId }: { onRetry: () => void; testId?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[14px] border border-[#262320] bg-[#141210] p-5 [font:500_14px_Inter] text-[#C9BFB0]" data-testid={testId}>
      {t('bounty.loadFailed')}
      <button type="button" onClick={onRetry} className={`inline-flex min-h-11 items-center rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F] ${FOCUS}`}>
        {t('bounty.retry')}
      </button>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-[14px] bg-[#1C1916] ${className}`} />;
}

export function BountyHeaderLinks() {
  const { t } = useI18n();
  const { signedIn } = useBountySession();
  return (
    <div className="flex items-center gap-2">
      <Link to="/bounties" className={`hidden h-11 items-center rounded-full px-3 [font:700_13px_JetBrains_Mono] text-[#C9BFB0] hover:text-[#F4EDE2] sm:inline-flex ${FOCUS}`}>
        {t('bounty.nav.board')}
      </Link>
      <Link to={signedIn ? '/' : '/login'} className={`inline-flex h-11 items-center rounded-full border border-[#2E2A25] px-3.5 [font:700_13px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#3FD17F] ${FOCUS}`}>
        {signedIn ? t('bounty.nav.app') : t('bounty.nav.signIn')}
      </Link>
      <HeaderLocale size="lg" />
    </div>
  );
}

/**
 * The frame of the bounty pages. A signed-in learner keeps the app's own top bar (nav, lives, identity);
 * a visitor with no session gets the small public header, like the other public pages.
 */
export function BountyShell({ children, width = 960 }: { children: ReactNode; width?: 960 | 720 }) {
  const { signedIn } = useBountySession();
  const max = width === 720 ? 'max-w-[720px]' : 'max-w-[960px]';
  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={SHOP_GRID} data-testid="bounty-page">
      {signedIn ? (
        <DashboardTopBar xp={null} achievements={null} activities={null} />
      ) : (
        <header className={`mx-auto flex h-16 ${max} items-center justify-between px-4 sm:px-8`}>
          <Link to="/" className={`rounded [font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2] ${FOCUS}`}>
            ITERA<span className="text-[#3FD17F]">/</span>
          </Link>
          <BountyHeaderLinks />
        </header>
      )}
      <main className={`mx-auto flex w-full ${max} flex-col gap-6 px-4 pt-4 sm:px-8 sm:pt-8 ${signedIn ? 'pb-28 sm:pb-16' : 'pb-16'}`}>{children}</main>
    </div>
  );
}
