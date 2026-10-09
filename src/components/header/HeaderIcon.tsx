import type { SVGProps } from 'react';
import { HEADER_ICON_FILLED, HEADER_ICON_STROKED, type HeaderIconName } from '@/consts/headerIconPaths';

interface Props extends SVGProps<SVGSVGElement> {
  name: HeaderIconName;
  size?: number;
}

/** One inline SVG glyph of the header, filled or stroked by name; the flame carries the flicker class. */
export function HeaderIcon({ name, size = 18, ...rest }: Props) {
  const filled = HEADER_ICON_FILLED[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path className={name === 'flame' ? 'hd-flame' : undefined} d={filled ?? HEADER_ICON_STROKED[name]} />
    </svg>
  );
}
