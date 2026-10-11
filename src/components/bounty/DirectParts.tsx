import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '@/components/bounty/bountyUi';
import { MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';

export function DirectChip() {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full border border-[#F2C66D]/60 bg-[#F2C66D]/10 px-2.5 py-1 ${MONO_LABEL} text-[#F2C66D]`} data-testid="bounty-direct-chip">
      {t('bounty.direct.label')}
    </span>
  );
}

/** Who a direct bounty is for, and who enforces it. The wallet links to its public profile. */
export function DirectNotice({ wallet, short, children }: { wallet: string; short: string; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Notice testId="bounty-direct-notice">
      <span className="flex flex-col gap-1.5">
        <strong className="text-[#F4EDE2]">{t('bounty.direct.label')}</strong>
        <span>{t('bounty.direct.only', { wallet: short })}</span>
        <Link to={`/u/${wallet}`} className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline" data-testid="bounty-direct-profile">
          {t('bounty.direct.profile')} →
        </Link>
        {children}
      </span>
    </Notice>
  );
}
