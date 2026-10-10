import { Link, useParams } from 'react-router-dom';
import { GiftLifePanel } from '@/components/gift/GiftLifePanel';
import { LivesHearts } from '@/components/lives/LivesHearts';
import { SHOP_GRID, CARD, FOCUS } from '@/components/shop/shopStyles';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TeraNote } from '@/components/tera/TeraNote';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useGiftPrice } from '@/hooks/useGift';
import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { looksLikeAddress } from '@/utils/credential';
import { shortWallet } from '@/utils/gift';

/** /gift/:wallet — the first-party side of the gift blink: the recipient's Tera and the same gift button. */
export default function GiftPage() {
  const { wallet = '' } = useParams();
  const { t, locale } = useI18n();
  const valid = looksLikeAddress(wallet);
  const name = valid ? shortWallet(wallet) : '';
  usePageTitle(valid ? t('gift.page.title', { name }) : t('gift.buttonPlain'));
  const query = useLearnerProfile(valid ? wallet : '', locale);
  const price = useGiftPrice();
  const profile = query.data?.status === 'ok' ? query.data.profile : null;
  const companion = profile?.companion ?? null;
  const unknown = !valid || query.data?.status === 'invalid' || (profile && !companion && profile.certifications.length === 0 && profile.medals.length === 0);

  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={SHOP_GRID} data-testid="gift-page">
      <header className="mx-auto flex h-16 max-w-[720px] items-center px-4 sm:px-8">
        <Link to="/" className={`rounded [font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2] ${FOCUS}`}>
          ITERA<span className="text-[#3FD17F]">/</span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pb-14 pt-4 sm:pt-8">
        {valid && query.isPending && <TeraLoader size="md" label={t('passport.credential.loading')} />}
        {unknown && (
          <div className={`${CARD} p-5`} data-testid="gift-unknown">
            <TeraNote mood="oops" title={t('gift.page.unknown')} className="!pt-2" />
          </div>
        )}
        {valid && !unknown && !query.isPending && (
          <section className={`${CARD} flex flex-col items-center gap-5 border-b-[5px] border-b-[#2E2A25] p-6 text-center sm:p-8`} data-testid="gift-card">
            {companion?.imageUrl ? (
              <img src={companion.imageUrl} alt="" width={220} height={220} className="h-[220px] w-[220px] rounded-[18px] border border-[#262320]" data-testid="gift-art" />
            ) : (
              <span className="flex h-[180px] items-end justify-center">
                <TeraOutfit mood="happy" size="xl" outfit={null} />
              </span>
            )}
            <h1 className="[font:700_44px/1_'Barlow_Condensed'] max-sm:text-[34px]" title={wallet}>
              {t('gift.page.title', { name })}
            </h1>
            <p className="max-w-[480px] [font:400_15px/1.5_Inter] text-[#C9BFB0]">{price.data ? t('gift.page.body', { price: price.data.priceLabel }) : t('gift.page.bodyPlain')}</p>
            {companion?.lives != null && (
              <LivesHearts current={companion.lives} max={companion.maxLives} size={22} label={t('gift.page.lives', { current: companion.lives, max: companion.maxLives })} className="gap-1" />
            )}
            <GiftLifePanel wallet={wallet} className="items-center [&>div]:justify-center" />
            <Link to={`/u/${wallet}`} className={`rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`} data-testid="gift-profile-link">
              {t('gift.page.profile')} →
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
