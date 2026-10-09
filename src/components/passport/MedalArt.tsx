import { useState } from 'react';
import { credentialImageUrl } from '@/services/credential.service';
import type { AchievementKind } from '@/types/achievements';

interface Props {
  glyph: string;
  title: string;
  kind: AchievementKind;
  credentialId: string | null;
  earned: boolean;
  accent: string;
  accentDark: string;
  size: number;
  lang: string;
}

const KIND_PATH: Record<AchievementKind, string> = {
  streak: 'M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z',
  milestone: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  trail: 'M5 4v16M5 5h12l-3 4 3 4H5',
  day: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4v4l3 2',
};

/** The medal: backend artwork (a rounded card with the coin and Tera) when earned (coin fallback if it fails to load), a dashed per-kind outline when locked. */
export function MedalArt({ glyph, title, kind, credentialId, earned, accent, accentDark, size, lang }: Props) {
  const [failed, setFailed] = useState(false);
  const src = earned && credentialId ? credentialImageUrl(credentialId, lang) : null;
  if (earned && src && !failed) {
    return <img src={src} alt={title} width={size} height={size} loading="lazy" onError={() => setFailed(true)} className="rounded-[14%]" style={{ width: size, height: size }} data-testid="medal-art" />;
  }
  if (earned) {
    return (
      <span
        role="img"
        aria-label={title}
        className="box-border grid -rotate-6 place-items-center rounded-full border-b-[5px] [font:700_15px_JetBrains_Mono] text-[#0A0908]"
        style={{ width: size, height: size, background: accent, borderBottomColor: accentDark }}
      >
        {glyph}
      </span>
    );
  }
  return (
    <span role="img" aria-label={title} className="box-border grid place-items-center rounded-full border-2 border-dashed border-[#2E2A25] text-[#8A8276]" style={{ width: size, height: size, opacity: 0.35 }}>
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={KIND_PATH[kind] ?? KIND_PATH.milestone} />
      </svg>
    </span>
  );
}
