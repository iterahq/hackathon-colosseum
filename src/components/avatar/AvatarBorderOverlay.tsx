import { useId } from 'react';
import type { AvatarBorder } from '@/types/crystals';
import './avatarBorder.css';

/**
 * The art's own green ring is the outer ~6% of the radius of the chip (3 of 50 units of a 100 unit
 * box). The overlay is an annulus drawn over exactly that band, a hair wider so no green shows at
 * the edge, in a 100-unit viewBox so it is the same at every size. Pure SVG / CSS, no image.
 */
const OUTER = 50;
const BAND = 3.6;

const spin = (animated: boolean, pulse = false) => (animated ? (pulse ? 'lb-pulse' : 'lb-spin') : '');

function Ring({ border, gradientId }: { border: AvatarBorder; gradientId: string }) {
  const { style, colors, animated } = border;
  const first = colors[0];
  const mid = OUTER - BAND / 2;
  if (style === 'conic') {
    const stops = colors.length > 1 ? colors.join(', ') : `${first}, ${first}`;
    return (
      <span
        aria-hidden
        data-border-style="conic"
        className={`absolute inset-0 rounded-full ${spin(animated)}`}
        style={{
          background: `conic-gradient(from 0deg, ${stops})`,
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${BAND * 2}%), #000 calc(100% - ${BAND * 2}% + 0.5px))`,
          mask: `radial-gradient(farthest-side, transparent calc(100% - ${BAND * 2}%), #000 calc(100% - ${BAND * 2}% + 0.5px))`,
        }}
      />
    );
  }
  const stroke = style === 'gradient' ? `url(#${gradientId})` : first;
  return (
    <svg aria-hidden data-border-style={style} viewBox="0 0 100 100" className={`absolute inset-0 h-full w-full ${spin(animated, style === 'solid' || style === 'double')}`} style={{ transformOrigin: '50% 50%' }}>
      {style === 'gradient' && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {colors.map((c, i) => (
              <stop key={`${c}-${i}`} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      {style === 'double' ? (
        <>
          <circle cx="50" cy="50" r={OUTER - 0.7} fill="none" stroke={first} strokeWidth="1.4" />
          <circle cx="50" cy="50" r={OUTER - 2.9} fill="none" stroke={colors[1] ?? first} strokeWidth="1.4" />
        </>
      ) : (
        <circle cx="50" cy="50" r={mid} fill="none" stroke={stroke} strokeWidth={BAND} strokeDasharray={style === 'dashed' ? '5.2 3.2' : undefined} />
      )}
    </svg>
  );
}

/** Sits over the chip art, inside the avatar's box: it never changes the size, never takes a click. */
export function AvatarBorderOverlay({ border }: { border: AvatarBorder }) {
  const gradientId = useId();
  return (
    <span aria-hidden data-testid="avatar-border" data-border-style={border.style} data-border-animated={border.animated} className="pointer-events-none absolute inset-0 rounded-full">
      {border.glow && <span className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 8px 1px ${border.colors[0]}99` }} />}
      <Ring border={border} gradientId={gradientId} />
    </span>
  );
}

/** A border alone on a dark disc, `size` px: for swatches in the shop and the wardrobe; animates like the real one. */
export function BorderRing({ border, size = 56 }: { border: AvatarBorder; size?: number }) {
  return (
    <span className="relative inline-block shrink-0 rounded-full bg-[#141210]" style={{ width: size, height: size }} data-testid="border-ring">
      <AvatarBorderOverlay border={border} />
    </span>
  );
}
