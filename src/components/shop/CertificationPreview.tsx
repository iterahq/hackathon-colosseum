import { useEffect, useState } from 'react';
import { ArtZoom } from '@/components/artviewer';
import { PassportPage } from '@/components/passport/PassportPage';
import { useI18n } from '@/i18n';
import { certificationPreviewUrl } from '@/services/artPreview';
import type { CertTarget } from '@/types/shopView';
import { TRAIL_COLORS } from '@/utils/trailDashboard';

interface Props {
  /** The learner's certification; a sample HTML one when there is none. */
  target: CertTarget | null;
  ink: string | null;
  frame: string | null;
  /** Colour of the item, for the client's own drawing when the backend art does not load. */
  color: string | null;
  /** The stored art of an owned cosmetic: shown instead of the try-on drawing. */
  realSrc?: string | null;
  width?: number;
}

const SAMPLE = { title: 'HTML', daysDone: 3, totalDays: 5, tier: null as string | null };

/** A certification wearing an ink or a frame: the backend's try-on art, or our own page drawing when it does not answer. */
export function CertificationPreview({ target, ink, frame, color, realSrc = null, width = 240 }: Props) {
  const { t, locale } = useI18n();
  const cert = target ?? SAMPLE;
  const src = realSrc ?? certificationPreviewUrl({ trail: cert.title, days: cert.daysDone, total: cert.totalDays, tier: cert.tier, ink, frame, lang: locale });
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const base = TRAIL_COLORS[1];
  const gold = cert.totalDays > 0 && cert.daysDone >= cert.totalDays;
  const drawn = (size: number) => (
    <span className="block rounded-[18px]" style={frame ? { boxShadow: `0 0 0 ${Math.max(4, size / 40)}px ${color ?? '#F2C66D'}, 0 0 0 ${Math.max(6, size / 28)}px #0A0908` } : undefined}>
      <PassportPage title={cert.title} color={ink && color ? { ...base, c: color, cl: color, cd: color } : base} total={Math.max(1, cert.totalDays)} done={cert.daysDone} variant={gold ? 'gold' : 'active'} ribbon={t('passport.ribbon')} width={size} />
    </span>
  );
  const usable = Boolean(src) && !failed;

  return (
    <ArtZoom
      title={cert.title}
      line={t('viewer.cert.line', { done: cert.daysDone, total: cert.totalDays })}
      asset={realSrc ? target?.assetAddress : null}
      src={usable ? src : null}
      full={usable ? undefined : <PassportPage title={cert.title} color={ink && color ? { ...base, c: color, cl: color, cd: color } : base} total={Math.max(1, cert.totalDays)} done={cert.daysDone} variant={gold ? 'gold' : 'active'} ribbon={t('passport.ribbon')} />}
      aspect={3 / 4}
    >
      <span className="block" style={{ width }} data-testid="cert-preview" data-source={usable ? 'backend' : 'client'} data-ink={ink ?? 'none'} data-frame={frame ?? 'none'}>
        {usable ? <img src={src ?? undefined} alt="" onError={() => setFailed(true)} className="block h-auto w-full rounded-2xl" style={{ aspectRatio: '3 / 4' }} /> : drawn(width)}
      </span>
    </ArtZoom>
  );
}
