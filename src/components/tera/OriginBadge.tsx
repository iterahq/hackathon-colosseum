import { ArrowLeftRight, Award, Handshake, Lock, ShoppingBag } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { TeraOrigin } from '@/types/tera';

const CHIP = 'inline-flex min-h-[22px] items-center gap-1 rounded-full px-2 [font:700_10px/1_JetBrains_Mono] uppercase tracking-[.08em]';

/**
 * How a Tera was obtained, as one chip that cannot be mistaken for another: earned is a solid gold chip with a
 * medal, bought is a grey outline with a bag, sponsored is a dashed outline in the brand's colour with a handshake.
 * Beside it, whether the Tera can change hands.
 */
export function OriginBadge({ origin, transfer = true, className = '' }: { origin: TeraOrigin; transfer?: boolean; className?: string }) {
  const { t } = useI18n();
  const accent = origin.sponsor?.accent ?? '#F4EDE2';
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} data-testid="tera-origin" data-origin={origin.kind} data-transferable={origin.transferable}>
      {origin.kind === 'earned' && (
        <span className={`${CHIP} bg-[#F2C66D] text-[#0A0908]`}>
          <Award size={11} aria-hidden />
          {t('origin.earned')}
        </span>
      )}
      {origin.kind === 'bought' && (
        <span className={`${CHIP} border border-[#5E574E] text-[#C9BFB0]`}>
          <ShoppingBag size={11} aria-hidden />
          {t('origin.bought')}
        </span>
      )}
      {origin.kind === 'sponsor' && (
        <span className={`${CHIP} border border-dashed`} style={{ borderColor: accent, color: accent }}>
          <Handshake size={11} aria-hidden />
          {origin.sponsor ? t('origin.sponsorBy', { brand: origin.sponsor.brand }) : t('origin.sponsor')}
        </span>
      )}
      {transfer && (
        <span className="inline-flex items-center gap-1 [font:600_10px/1_JetBrains_Mono] uppercase tracking-[.06em] text-[#A0978A]">
          {origin.transferable ? <ArrowLeftRight size={10} aria-hidden /> : <Lock size={10} aria-hidden />}
          {t(origin.transferable ? 'origin.transferable' : 'origin.bound')}
        </span>
      )}
    </span>
  );
}

/** The origin as one small round mark, for a picture too small to carry the chip. */
export function OriginGlyph({ origin, className = '' }: { origin: TeraOrigin; className?: string }) {
  const { t } = useI18n();
  const accent = origin.sponsor?.accent ?? '#F4EDE2';
  const label = origin.kind === 'earned' ? t('origin.earned') : origin.kind === 'bought' ? t('origin.bought') : t('origin.sponsor');
  const Icon = origin.kind === 'earned' ? Award : origin.kind === 'bought' ? ShoppingBag : Handshake;
  const look = origin.kind === 'earned' ? 'border-[#141210] bg-[#F2C66D] text-[#0A0908]' : origin.kind === 'bought' ? 'border-[#5E574E] bg-[#141210] text-[#C9BFB0]' : 'border-dashed bg-[#141210]';
  return (
    <span role="img" aria-label={label} title={label} data-testid="tera-origin-glyph" data-origin={origin.kind} className={`flex h-5 w-5 items-center justify-center rounded-full border ${look} ${className}`} style={origin.kind === 'sponsor' ? { borderColor: accent, color: accent } : undefined}>
      <Icon size={11} aria-hidden />
    </span>
  );
}
