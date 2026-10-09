import { OnChainMark } from './OnChainMark';

interface Props {
  glyph: string;
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
}

/** A 76 px coin with a glyph: the accent coin tilted when earned, a dashed outline while locked. */
export function Medal({ glyph, title, caption, earned, accent, accentDark, size = 76, txSignature = null, assetAddress = null, minted = false }: Props) {
  return (
    <div data-testid="passport-medal" data-earned={earned} className="flex w-[104px] shrink-0 flex-col items-center gap-2 text-center">
      <span
        role="img"
        aria-label={title}
        className={`box-border grid place-items-center rounded-full [font:700_15px_JetBrains_Mono] ${
          earned ? '-rotate-6 border-b-[5px] text-[#0A0908]' : 'border-2 border-dashed border-[#2E2A25] text-[#8A8276]'
        }`}
        style={{ width: size, height: size, ...(earned ? { background: accent, borderBottomColor: accentDark } : {}), opacity: earned ? 1 : 0.35 }}
      >
        {glyph}
      </span>
      <span className="[font:600_13px/1.2_Inter]" style={{ color: earned ? '#F4EDE2' : '#A0978A' }}>
        {title}
      </span>
      {earned && minted ? (
        <OnChainMark txSignature={txSignature} assetAddress={assetAddress} />
      ) : (
        <span className="line-clamp-2 [font:500_10px/1.3_JetBrains_Mono] text-[#A0978A]">{caption}</span>
      )}
    </div>
  );
}
