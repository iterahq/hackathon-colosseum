import { useI18n } from '@/i18n';
import type { PassportPageData } from '@/types/achievements';
import { shortName } from '@/utils/trailDashboard';
import { OnChainMark } from './OnChainMark';
import { PassportPage } from './PassportPage';
import { pageColor, pageVariant } from './pageVariant';

interface Props {
  page: PassportPageData;
  pulseNext?: boolean;
  caption?: string;
  onOpen?: (trailId: string) => void;
}

/** A 180x240 page of the dashboard row with what the learner needs to know under it. */
export function PassportMiniCard({ page, pulseNext, caption, onOpen }: Props) {
  const { t } = useI18n();
  const variant = pageVariant(page);
  const locked = variant === 'locked';
  const minted = page.mintStatus === 'minted' && Boolean(page.assetAddress || page.txSignature);
  const color = pageColor(page);

  const body = (
    <>
      <PassportPage
        title={page.trailTitle}
        color={color}
        total={page.totalDays}
        done={page.daysDone}
        variant={variant}
        width={180}
        pulseNext={pulseNext}
        ribbon={t('passport.ribbon')}
      />
      <span className="flex min-h-[40px] flex-col items-start gap-1 [font:500_12px_JetBrains_Mono]">
        {locked ? (
          <span className="text-[#A0978A]">{t('passport.unlocksAfter', { name: shortName(page.lockedBy ?? page.trailTitle) })}</span>
        ) : (
          <>
            <span className="text-[#C9BFB0]">{t('passport.days', { done: page.daysDone, total: page.totalDays })}</span>
            {variant === 'fresh' && (
              <span className="text-[#A0978A]">
                <span className="group-hover:hidden group-focus-visible:hidden">{t('passport.notStarted')}</span>
                <span className="hidden group-hover:inline group-focus-visible:inline" style={{ color: color.cl }}>
                  {t('passport.startHere')}
                </span>
              </span>
            )}
          </>
        )}
        {caption && <span className="whitespace-normal text-left text-[#A0978A]">{caption}</span>}
      </span>
    </>
  );

  return (
    <div data-testid="passport-card" data-variant={variant} className="flex w-[180px] shrink-0 snap-start flex-col gap-2">
      {locked || !onOpen ? (
        <div className="flex flex-col gap-2">{body}</div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(page.trailId)}
          className="group flex flex-col gap-2 rounded-2xl bg-transparent p-0 text-left text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3FD17F]"
        >
          {body}
        </button>
      )}
      {minted && <OnChainMark txSignature={page.txSignature} assetAddress={page.assetAddress} />}
    </div>
  );
}
