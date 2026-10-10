import { ArtZoom } from '@/components/artviewer';
import { BTN_SECONDARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { credentialImageUrl } from '@/services/credential.service';
import type { ShopItem } from '@/types/shop';
import type { CertTarget } from '@/types/shopView';

interface Props {
  cert: CertTarget;
  /** The inks and frames of the shop: `ownedRefs` says which certification each one is on. */
  cosmetics: ShopItem[];
  onBuy: (trailId: string) => void;
}

/** A certification with what is applied to it. Ink and frame cannot be moved: the only action is to buy for this one. */
export function WardrobeCert({ cert, cosmetics, onBuy }: Props) {
  const { t, locale } = useI18n();
  const on = (kind: 'ink' | 'frame') => cosmetics.filter((item) => item.kind === kind && item.ownedRefs.includes(cert.trailId));
  const inks = on('ink');
  const frames = on('frame');
  const src = cert.credentialId ? credentialImageUrl(cert.credentialId, locale, `${cert.daysDone}-${cert.tier ?? ''}`) : null;
  const line = (label: string, list: ShopItem[], testId: string) => (
    <p className="flex flex-wrap items-baseline gap-x-2 [font:500_14px/1.4_Inter] text-[#C9BFB0]" data-testid={testId} data-applied={list.map((i) => i.key).join(',') || 'none'}>
      <span className={`${MONO_LABEL} text-[#A0978A]`}>{label}</span>
      {list.length === 0 ? <span className="text-[#A0978A]">{t('wardrobe.cert.none')}</span> : list.map((item) => <span key={item.key} className="text-[#F4EDE2]">{t('wardrobe.cert.applied', { name: item.title, trail: cert.title })}</span>)}
    </p>
  );

  return (
    <article className={`${CARD} flex min-w-0 gap-4 p-3 sm:p-4`} data-testid="wardrobe-cert" data-trail={cert.trailId}>
      {src && (
        <ArtZoom title={cert.title} line={t('viewer.cert.line', { done: cert.daysDone, total: cert.totalDays })} src={src} asset={cert.assetAddress} aspect={3 / 4} className="flex-none self-start">
          <img src={src} alt="" loading="lazy" className="block h-auto w-[96px] rounded-xl sm:w-[120px]" style={{ aspectRatio: '3 / 4' }} />
        </ArtZoom>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 className="[font:700_24px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{cert.title}</h4>
        {line(t('wardrobe.cert.ink'), inks, 'wardrobe-cert-ink')}
        {inks.length > 1 && <p className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('wardrobe.cert.latest')}</p>}
        {line(t('wardrobe.cert.frame'), frames, 'wardrobe-cert-frame')}
        <button type="button" onClick={() => onBuy(cert.trailId)} data-testid="wardrobe-cert-buy" className={`${BTN_SECONDARY} mt-auto !min-h-11 self-start !px-3 ![font:700_13px_Inter]`}>
          {t('wardrobe.cert.buy')}
        </button>
      </div>
    </article>
  );
}
