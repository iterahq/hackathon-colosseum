import { useI18n } from '@/i18n';
import type { AchievementKind } from '@/types/achievements';
import { MedalArt } from './MedalArt';
import { OnChainMark } from './OnChainMark';

interface Props {
  glyph: string;
  kind: AchievementKind;
  credentialId: string | null;
  title: string;
  /** What it takes to earn it; shown as a caption while locked. */
  caption: string;
  earned: boolean;
  accent: string;
  accentDark: string;
  size?: number;
  txSignature?: string | null;
  assetAddress?: string | null;
  minted?: boolean;
  /** Just the art, with the title and caption as a tooltip. */
  compact?: boolean;
}

/** A medal and its caption: the backend art when earned, a dashed outline while locked. */
export function Medal({ glyph, kind, credentialId, title, caption, earned, accent, accentDark, size = 76, txSignature = null, assetAddress = null, minted = false, compact = false }: Props) {
  const { locale } = useI18n();
  if (compact) {
    return (
      <div data-testid="passport-medal" data-earned={earned} title={earned ? title : `${title} · ${caption}`} className="shrink-0">
        <MedalArt glyph={glyph} title={title} kind={kind} credentialId={credentialId} earned={earned} accent={accent} accentDark={accentDark} size={size} lang={locale} />
      </div>
    );
  }
  return (
    <div data-testid="passport-medal" data-earned={earned} className="flex w-[104px] shrink-0 flex-col items-center gap-2 text-center">
      <MedalArt glyph={glyph} title={title} kind={kind} credentialId={credentialId} earned={earned} accent={accent} accentDark={accentDark} size={size} lang={locale} />
      <span className="[font:600_13px/1.2_Inter]" style={{ color: earned ? '#F4EDE2' : '#A0978A' }}>
        {title}
      </span>
      {earned && minted ? (
        <OnChainMark txSignature={txSignature} assetAddress={assetAddress} />
      ) : (
        <span className="line-clamp-3 [font:500_10px/1.3_JetBrains_Mono] text-[#A0978A]">{caption}</span>
      )}
    </div>
  );
}
