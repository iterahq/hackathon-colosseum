import { LINK } from '@/components/bounty/bountyUi';
import { CopyButton } from '@/components/passport/CopyButton';
import { MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';

interface Props {
  actionUrl: string;
  blinkUrl: string | null;
  /** `sponsor`: the wallet that posted it shares the link. `visitor`: anyone reading the page may fund through it. */
  audience: 'sponsor' | 'visitor';
  sponsorShort?: string | null;
}

/** The public funding link of a bounty that waits for its money: the Action URL, a copy button and its Blink preview. */
export function FundingLink({ actionUrl, blinkUrl, audience, sponsorShort }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-[#2E2A25] bg-[#0A0908] p-3.5" data-testid="bounty-funding-link" data-audience={audience}>
      <span className={`${MONO_LABEL} text-[#F2C66D]`}>{t('bounty.fundLink.title')}</span>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">
        {audience === 'sponsor' ? t('bounty.fundLink.sponsor') : t('bounty.fundLink.visitor', { wallet: sponsorShort ?? '' })}
      </p>
      <code className="block select-all rounded-lg border border-[#262320] bg-[#141210] px-3 py-2 [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2] [overflow-wrap:anywhere]" data-testid="bounty-funding-link-url">
        {actionUrl}
      </code>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <CopyButton value={actionUrl} label={t('bounty.fundLink.copy')} doneLabel={t('bounty.copied')} />
        {blinkUrl && (
          <a href={blinkUrl} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="bounty-funding-link-blink">
            {t('bounty.fundLink.preview')} ↗
          </a>
        )}
      </div>
    </div>
  );
}
