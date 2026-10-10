import { useI18n } from '@/i18n';
import { countOf } from '@/utils/plural';
import { shortAddress } from '@/lib/explorer';

interface Props {
  wallet: string | null;
  pages: number;
  stamps: number;
  medals: number;
}

/** The chunky green band at the top of /passport. */
export function PassportHero({ wallet, pages, stamps, medals }: Props) {
  const { t } = useI18n();
  return (
    <header
      className="box-border flex min-h-[60px] flex-wrap items-center justify-between gap-3 rounded-[14px] border-b-[6px] border-b-[#1F8A4F] bg-[#3FD17F] px-4 py-3 text-[#0A0908] sm:px-6"
      data-testid="passport-hero"
    >
      <h1 className="[font:700_32px/1_'Barlow_Condensed'] max-sm:text-[26px]">{t('passport.hero.title')}</h1>
      <span className="flex flex-wrap items-center gap-3 [font:700_13px_JetBrains_Mono]">
        <span className={`rounded-full px-3 py-1.5 ${wallet ? 'bg-[#0A0908] text-[#F4EDE2]' : 'border border-[#0A0908]/35 bg-[#F4EDE2]/90 text-[#3A352F]'}`} data-testid="passport-wallet">
          {wallet ? shortAddress(wallet) : t('passport.wallet.none')}
        </span>
        <span>{t('passport.hero.totals', { pages: countOf(t, pages, 'page'), stamps: countOf(t, stamps, 'stamp'), medals: countOf(t, medals, 'medal') })}</span>
      </span>
    </header>
  );
}
