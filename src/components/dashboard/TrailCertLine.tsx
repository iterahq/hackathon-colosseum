import { OnChainMark } from '@/components/passport/OnChainMark';
import { useI18n } from '@/i18n';
import type { PassportPageData } from '@/types/achievements';

interface Props {
  done: number;
  total: number;
  locked: boolean;
  cert?: PassportPageData;
}

/** One line: the certification of the trail as a row of stamp slots, its count and the on-chain mark. */
export function TrailCertLine({ done, total, locked, cert }: Props) {
  const { t } = useI18n();
  const gold = !locked && total > 0 && done >= total;
  const stamped = Math.min(done, total);
  const minted = cert?.mintStatus === 'minted' && Boolean(cert.assetAddress || cert.txSignature);
  const tone = locked ? '#8A8276' : gold ? '#F2C66D' : '#3FD17F';
  return (
    <div className="flex min-w-0 basis-full flex-wrap items-center md:flex-1 md:basis-0 gap-x-3 gap-y-1.5 [font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="trail-cert" data-gold={gold}>
      <span className="shrink-0" style={{ color: gold ? '#F2C66D' : undefined }}>{t(gold ? 'dash.trail.certGold' : 'dash.trail.cert')}</span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: Math.min(total, 12) }, (_, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-full" style={i < stamped && !locked ? { background: tone } : { border: '1.5px dashed #3A342D' }} />
        ))}
      </span>
      <span className="text-[#C9BFB0]">{locked ? t('passport.locked') : `${stamped}/${total} ${t('count.stamp.other')}`}</span>
      {minted && cert && <OnChainMark txSignature={cert.txSignature} assetAddress={cert.assetAddress} />}
    </div>
  );
}
