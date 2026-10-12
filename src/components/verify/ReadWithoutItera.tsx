import { Link } from 'react-router-dom';
import { FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { RawAccount } from '@/components/chain/RawAccount';
import { CARD } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';

/** Under a credential: the asset account itself, read by the visitor's browser, with no call to Itera. */
export function ReadWithoutItera({ asset }: { asset: string }) {
  const { t } = useI18n();
  return (
    <section className={`${CARD} flex w-full min-w-0 flex-col gap-3 p-4 sm:p-5`} aria-labelledby="read-without-itera" data-testid="read-without-itera">
      <h2 id="read-without-itera" className="[font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('verify.read.title')}</h2>
      <p className="[font:400_13px/1.5_Inter] text-[#C9BFB0]">{t('verify.read.intro')}</p>
      <RawAccount address={asset} />
      {!FOCUS_EARN_STORY_OFF && (
        <Link to="/verify#durable" className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline">
          {t('verify.read.durable')} →
        </Link>
      )}
    </section>
  );
}
